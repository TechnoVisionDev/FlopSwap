import { ethers } from "ethers";
import { MongoClient } from "mongodb";

// --- MongoDB connection helper ---
let cachedDb = null;
async function connectToDatabase() {
  if (cachedDb) return cachedDb;
  const client = new MongoClient(process.env.MONGODB_URI, {
    tlsAllowInvalidCertificates: true,
  });  
  await client.connect();
  const db = client.db(process.env.MONGODB_DB);
  cachedDb = db;
  return db;
}

// FLOP node configuration (Layer‑1 fork of Dogecoin)
const FLOP_RPC_PROTOCOL = process.env.FLOP_RPC_PROTOCOL || "http";
const FLOP_RPC_HOST = process.env.FLOP_RPC_HOST || "localhost";
const FLOP_RPC_PORT = process.env.FLOP_RPC_PORT;
const FLOP_RPC_USER = process.env.FLOP_RPC_USER;
const FLOP_RPC_PASS = process.env.FLOP_RPC_PASS; // RPC password

// Wallet encryption password from .env.local
const WALLET_PASS = process.env.WALLET_PASS;

// Other environment variables
const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL; // e.g., https://polygon.llamarpc.com
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS; // WFLOP contract address on Polygon
const BRIDGE_PRIVATE_KEY = process.env.BRIDGE_PRIVATE_KEY;
const WFLOP_DEPOSIT_ADDRESS = process.env.NEXT_PUBLIC_WFLOP_DEPOSIT_ADDRESS;
const FLOP_DEPOSIT_ADDRESS = process.env.NEXT_PUBLIC_FLOP_DEPOSIT_ADDRESS;

// Minimal ABI for WFLOP
const CONTRACT_ABI = [
  "function mint(address to, uint256 amount) external",
  "function burn(address from, uint256 amount) external",
  "function balanceOf(address account) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];

// Construct FLOP RPC URL (without embedded credentials)
const flopRpcURL = `${FLOP_RPC_PROTOCOL}://${FLOP_RPC_HOST}:${FLOP_RPC_PORT}`;

// Basic Auth header for FLOP node RPC calls
const authHeader = `Basic ${Buffer.from(`${FLOP_RPC_USER}:${FLOP_RPC_PASS}`).toString("base64")}`;

/**
 * Polls for a transaction receipt until a valid blockHash is found or timeout.
 */
async function pollTransactionReceipt(provider, txHash, timeoutMs = 60000, pollInterval = 5000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    let receipt = null;
    try {
      receipt = await provider.getTransactionReceipt(txHash);
    } catch (err) {
      // Ignore polling errors silently
    }
    if (receipt && receipt.blockHash && receipt.blockHash !== "0x0") {
      return receipt;
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }
  throw new Error("Transaction confirmation timed out. Please try again later.");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { transactionHash, userAddress, swapOption } = req.body;
  if (!transactionHash || !userAddress || !swapOption) {
    return res.status(400).json({ error: "Missing parameters. Please provide a valid transaction ID and address." });
  }

  // --- Check for duplicate TXIDs in MongoDB ---
  const db = await connectToDatabase();
  const txCollection = db.collection("processedTxIds");
  const existingTx = await txCollection.findOne({ txid: transactionHash });
  if (existingTx) {
    return res.status(400).json({ error: "This transaction ID has already been used. Please submit a new one." });
  }

  try {
    if (swapOption === "FLOP_TO_WFLOP") {
      // ---------- FLOP → WFLOP Flow ----------
      // Validate that the provided WFLOP (Polygon) address is valid
      if (!ethers.utils.isAddress(userAddress)) {
        return res.status(400).json({ error: "Invalid WFLOP address provided. Please enter a valid Polygon address." });
      }

      const rpcPayload = {
        jsonrpc: "1.0",
        id: "bridge",
        method: "gettransaction",
        params: [transactionHash],
      };

      const flopResponse = await fetch(flopRpcURL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify(rpcPayload),
      });

      if (!flopResponse.ok) {
        throw new Error("There was an issue connecting to the FLOP network. Please try again later.");
      }

      const flopData = await flopResponse.json();
      if (flopData.error) {
        throw new Error("Error from the FLOP network. Please verify your transaction details and try again.");
      }

      const txDetails = flopData.result;
      if (!txDetails) {
        return res.status(400).json({ error: "Unable to locate the transaction. Please check the transaction ID." });
      }

      const outputs = txDetails.details;
      if (!outputs || !Array.isArray(outputs)) {
        return res.status(400).json({ error: "Unexpected transaction details. Please verify your transaction ID." });
      }

      const matchingOutput = outputs.find((output) =>
        output.address &&
        output.address.toLowerCase() === FLOP_DEPOSIT_ADDRESS.toLowerCase() &&
        output.amount > 0
      );
      if (!matchingOutput) {
        return res.status(400).json({ error: "The transaction was not sent to the correct deposit address." });
      }

      const depositAmountInCoins = matchingOutput.amount;
      const depositAmount = ethers.utils.parseUnits(depositAmountInCoins.toString(), 18);

      // Mint WFLOP tokens on Polygon
      const polygonProvider = new ethers.providers.JsonRpcProvider(POLYGON_RPC_URL);
      const bridgeWallet = new ethers.Wallet(BRIDGE_PRIVATE_KEY, polygonProvider);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, bridgeWallet);
      const currentGasPrice = await polygonProvider.getGasPrice();
      const adjustedGasPrice = currentGasPrice.mul(110).div(100);
      const tx = await contract.mint(userAddress, depositAmount, { gasPrice: adjustedGasPrice });

      let receipt;
      try {
        receipt = await pollTransactionReceipt(polygonProvider, tx.hash, 60000, 5000);
      } catch (confirmError) {
        return res.status(200).json({
          message: "Swap transaction sent but not yet confirmed.",
          polygonTxHash: tx.hash,
          mintedAmount: depositAmount.toString(),
          warning: "Transaction confirmation timed out. Please check back later.",
        });
      }

      // Store TXID after a successful swap
      await txCollection.insertOne({ txid: transactionHash, swapOption, createdAt: new Date() });

      return res.status(200).json({
        message: "Swap Successful: FLOP to WFLOP",
        polygonTxHash: tx.hash,
        mintedAmount: depositAmount.toString(),
        receipt,
        clearFields: true
      });
    } else if (swapOption === "WFLOP_TO_FLOP") {
      // ---------- WFLOP → FLOP Flow ----------
      // Validate that the provided address is a valid FLOP address.
      // (Assumes a valid FLOP address starts with "F" and is 34 characters long)
      if (!/^F[a-zA-Z0-9]{33}$/.test(userAddress)) {
        return res.status(400).json({ error: "Invalid FLOP address provided. Please enter a valid FLOP address." });
      }

      const polygonProvider = new ethers.providers.JsonRpcProvider(POLYGON_RPC_URL);
      const txReceipt = await polygonProvider.getTransactionReceipt(transactionHash);
      if (!txReceipt) {
        return res.status(400).json({ error: "Unable to retrieve transaction confirmation from Polygon. Please try again later." });
      }

      const transferTopic = ethers.utils.id("Transfer(address,address,uint256)");
      let burnEventFound = false;
      let burnAmount;
      for (const log of txReceipt.logs) {
        if (log.topics[0] === transferTopic) {
          const to = "0x" + log.topics[2].slice(26).toLowerCase();
          if (to === WFLOP_DEPOSIT_ADDRESS.toLowerCase()) {
            burnEventFound = true;
            burnAmount = ethers.BigNumber.from(log.data);
            break;
          }
        }
      }

      if (!burnEventFound) {
        return res.status(400).json({ error: "No token transfer to the designated burn address was detected. Please check your transaction." });
      }

      const bridgeWallet = new ethers.Wallet(BRIDGE_PRIVATE_KEY, polygonProvider);
      if (bridgeWallet.address.toLowerCase() !== WFLOP_DEPOSIT_ADDRESS.toLowerCase()) {
        return res.status(400).json({ error: "Configuration error: Bridge wallet mismatch. Please contact support." });
      }
      
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, bridgeWallet);
      const currentBalance = await contract.balanceOf(WFLOP_DEPOSIT_ADDRESS);
      if (currentBalance.lt(burnAmount)) {
        return res.status(400).json({ error: "Insufficient token balance for processing the burn transaction." });
      }

      const currentGasPrice = await polygonProvider.getGasPrice();
      const adjustedGasPrice = currentGasPrice.mul(110).div(100);
      let gasLimit;
      try {
        gasLimit = await contract.estimateGas.burn(WFLOP_DEPOSIT_ADDRESS, burnAmount, { gasPrice: adjustedGasPrice });
      } catch (err) {
        gasLimit = ethers.BigNumber.from("200000");
      }

      const burnTx = await contract.burn(WFLOP_DEPOSIT_ADDRESS, burnAmount, { gasPrice: adjustedGasPrice, gasLimit });
      let burnReceipt;
      try {
        burnReceipt = await pollTransactionReceipt(polygonProvider, burnTx.hash, 60000, 5000);
      } catch (confirmError) {
        return res.status(200).json({
          message: "Burn transaction sent but not yet confirmed.",
          polygonTxHash: transactionHash,
          burnTxHash: burnTx.hash,
          burnAmount: burnAmount.toString(),
          warning: "Burn confirmation timed out. Please check back later.",
        });
      }

      // --- FLOP SIDE ---
      const unlockPayload = {
        jsonrpc: "1.0",
        id: "walletpassphrase",
        method: "walletpassphrase",
        params: [WALLET_PASS, 60]
      };
      let unlockData;
      try {
        const unlockResponse = await fetch(flopRpcURL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": authHeader,
          },
          body: JSON.stringify(unlockPayload)
        });
        unlockData = await unlockResponse.json();
        if (unlockData.error && unlockData.error.code !== -15) {
          return res.status(500).json({ error: "Error unlocking wallet. Please ensure your wallet is properly configured." });
        }
      } catch (err) {
        return res.status(500).json({ error: "Unable to unlock wallet due to network issues. Please try again later." });
      }

      const coinAmount = ethers.utils.formatUnits(burnAmount, 18);
      const sendPayload = {
        jsonrpc: "1.0",
        id: "sendtoaddress",
        method: "sendtoaddress",
        params: [userAddress, coinAmount]
      };
      const sendResponse = await fetch(flopRpcURL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify(sendPayload)
      });
      
      let sendData;
      try {
        const text = await sendResponse.text();
        sendData = text ? JSON.parse(text) : {};
      } catch (parseError) {
        return res.status(500).json({ error: "There was an error processing your request. Please try again later." });
      }
      
      if (!sendResponse.ok || sendData.error) {
        return res.status(500).json({ error: "There was an error sending your FLOP coins. Please try again later." });
      }
      const flopTxHash = sendData.result;

      await txCollection.insertOne({ txid: transactionHash, swapOption, createdAt: new Date() });

      // For WFLOP → FLOP, return the FLOP deposit TXID (flopTxHash) for the Flopcoin block explorer.
      return res.status(200).json({
        message: "Swap Successful: WFLOP to FLOP",
        flopDepositTxHash: flopTxHash,
        burnTxHash: burnTx.hash,
        burnAmount: burnAmount.toString(),
        burnReceipt,
        clearFields: true
      });
    } else {
      return res.status(400).json({ error: "Invalid swap option provided." });
    }
  } catch (error) {
    return res.status(500).json({ error: "An unexpected error occurred. Please try again later." });
  }
}
