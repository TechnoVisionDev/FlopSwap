import { ethers } from "ethers";
import { MongoClient } from "mongodb";

// --- MongoDB connection helper ---
let cachedDb = null;
async function connectToDatabase() {
  if (cachedDb) return cachedDb;
  const client = new MongoClient(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
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
const FLOP_RPC_PASS = process.env.FLOP_RPC_PASS; // This is your RPC password from .env.local

// The wallet encryption password should be stored in your .env.local as WALLET_PASS
const WALLET_PASS = process.env.WALLET_PASS; // e.g. "1Javagirl!"

// Other environment variables
const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL; // e.g., https://polygon.llamarpc.com
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS; // WFLOP contract address on Polygon
const BRIDGE_PRIVATE_KEY = process.env.BRIDGE_PRIVATE_KEY;
// The designated WFLOP deposit (burn) address; this address should be controlled by BRIDGE_PRIVATE_KEY.
const WFLOP_DEPOSIT_ADDRESS = process.env.NEXT_PUBLIC_WFLOP_DEPOSIT_ADDRESS;
// For FLOP→WFLOP, we use the FLOP deposit address.
const FLOP_DEPOSIT_ADDRESS = process.env.NEXT_PUBLIC_FLOP_DEPOSIT_ADDRESS; 

// Minimal ABI for WFLOP (includes mint, burn, balanceOf, and the standard Transfer event)
const CONTRACT_ABI = [
  "function mint(address to, uint256 amount) external",
  "function burn(address from, uint256 amount) external",
  "function balanceOf(address account) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];

// Construct FLOP RPC URL (without embedded credentials)
const flopRpcURL = `${FLOP_RPC_PROTOCOL}://${FLOP_RPC_HOST}:${FLOP_RPC_PORT}`;

// Basic Auth header for general FLOP node RPC calls (uses the RPC password from .env.local)
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
      console.error("Error polling transaction receipt:", err);
    }
    console.log(`Polling receipt for ${txHash}:`, receipt);
    if (receipt && receipt.blockHash && receipt.blockHash !== "0x0") {
      return receipt;
    }
    console.log(`No valid receipt yet. Waiting ${pollInterval}ms...`);
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }
  throw new Error("Transaction receipt not found within timeout");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    console.log("Received non-POST request");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { transactionHash, userAddress, swapOption } = req.body;
  console.log("Received request with TX:", transactionHash, "Address:", userAddress, "Swap Option:", swapOption);
  if (!transactionHash || !userAddress || !swapOption) {
    console.log("Missing parameters");
    return res.status(400).json({ error: "Missing parameters" });
  }

  // --- Connect to MongoDB and check for duplicate TXIDs ---
  const db = await connectToDatabase();
  const txCollection = db.collection("processedTxIds");
  const existingTx = await txCollection.findOne({ txid: transactionHash });
  if (existingTx) {
    console.error("Duplicate TXID detected:", transactionHash);
    return res.status(400).json({ error: "Transaction ID already used" });
  }

  try {
    if (swapOption === "FLOP_TO_WFLOP") {
      // ---------- FLOP → WFLOP Flow ----------
      const rpcPayload = {
        jsonrpc: "1.0",
        id: "bridge",
        method: "gettransaction",
        params: [transactionHash],
      };

      console.log("Sending gettransaction RPC call to FLOP node at:", flopRpcURL);
      const flopResponse = await fetch(flopRpcURL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify(rpcPayload),
      });

      console.log("FLOP node HTTP status:", flopResponse.status);
      if (!flopResponse.ok) {
        console.error("FLOP node returned non-ok status:", flopResponse.status);
        throw new Error(`FLOP node responded with HTTP ${flopResponse.status}`);
      }

      const flopData = await flopResponse.json();
      if (flopData.error) {
        console.error("FLOP node error:", flopData.error);
        throw new Error(`FLOP node error: ${flopData.error.message}`);
      }

      const txDetails = flopData.result;
      console.log("Transaction details from FLOP node:", txDetails);
      if (!txDetails) {
        console.error("Transaction details not found");
        return res.status(400).json({ error: "Transaction not found" });
      }

      const outputs = txDetails.details;
      if (!outputs || !Array.isArray(outputs)) {
        console.error("Unexpected transaction details format");
        return res.status(400).json({ error: "Transaction details not in expected format" });
      }

      const matchingOutput = outputs.find((output) =>
        output.address &&
        output.address.toLowerCase() === FLOP_DEPOSIT_ADDRESS.toLowerCase() &&
        output.amount > 0
      );
      if (!matchingOutput) {
        console.error("No output found for deposit address", FLOP_DEPOSIT_ADDRESS);
        return res.status(400).json({ error: "Transaction not sent to the correct deposit address" });
      }

      const depositAmountInCoins = matchingOutput.amount;
      console.log("Deposit amount in coins:", depositAmountInCoins);

      const depositAmount = ethers.utils.parseUnits(depositAmountInCoins.toString(), 18);
      console.log("Converted deposit amount (wei):", depositAmount.toString());

      // Connect to Polygon and mint WFLOP tokens.
      console.log("Connecting to Polygon RPC:", POLYGON_RPC_URL);
      const polygonProvider = new ethers.providers.JsonRpcProvider(POLYGON_RPC_URL);
      const bridgeWallet = new ethers.Wallet(BRIDGE_PRIVATE_KEY, polygonProvider);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, bridgeWallet);

      const currentGasPrice = await polygonProvider.getGasPrice();
      const adjustedGasPrice = currentGasPrice.mul(110).div(100);
      console.log("Current gas price:", currentGasPrice.toString());
      console.log("Adjusted gas price:", adjustedGasPrice.toString());

      console.log("Sending mint transaction to Polygon for address:", userAddress, "amount:", depositAmount.toString());
      const tx = await contract.mint(userAddress, depositAmount, { gasPrice: adjustedGasPrice });
      console.log("Mint transaction sent, tx hash:", tx.hash);

      console.log("Awaiting Polygon transaction confirmation...");
      let receipt;
      try {
        receipt = await pollTransactionReceipt(polygonProvider, tx.hash, 60000, 5000);
        console.log("Polygon transaction confirmed, receipt:", receipt);
      } catch (confirmError) {
        console.error("Polygon confirmation error:", confirmError);
        // Do not store TXID if the transaction did not complete
        return res.status(200).json({
          message: "Swap transaction sent, but not yet confirmed.",
          polygonTxHash: tx.hash,
          mintedAmount: depositAmount.toString(),
          warning: "Transaction confirmation timed out, please check later.",
        });
      }

      // --- Store TXID as successfully processed ---
      await txCollection.insertOne({ txid: transactionHash, swapOption, createdAt: new Date() });

      return res.status(200).json({
        message: "Swap successful: FLOP to WFLOP",
        polygonTxHash: tx.hash,
        mintedAmount: depositAmount.toString(),
        receipt,
      });
    } else if (swapOption === "WFLOP_TO_FLOP") {
      // ---------- WFLOP → FLOP Flow ----------
      console.log("Connecting to Polygon RPC:", POLYGON_RPC_URL);
      const polygonProvider = new ethers.providers.JsonRpcProvider(POLYGON_RPC_URL);
      const txReceipt = await polygonProvider.getTransactionReceipt(transactionHash);
      if (!txReceipt) {
        console.error("Polygon transaction receipt not found");
        return res.status(400).json({ error: "Polygon transaction receipt not found" });
      }
      console.log("Polygon transaction receipt:", txReceipt);

      // Manually decode the Transfer events from the logs.
      const transferTopic = ethers.utils.id("Transfer(address,address,uint256)");
      let burnEventFound = false;
      let burnAmount;
      for (const log of txReceipt.logs) {
        if (log.topics[0] === transferTopic) {
          const from = "0x" + log.topics[1].slice(26).toLowerCase();
          const to = "0x" + log.topics[2].slice(26).toLowerCase();
          console.log("Detected Transfer event - from:", from, "to:", to);
          if (to === WFLOP_DEPOSIT_ADDRESS.toLowerCase()) {
            burnEventFound = true;
            burnAmount = ethers.BigNumber.from(log.data);
            console.log("Found transfer to burn address. Burn amount:", burnAmount.toString());
            break;
          }
        }
      }

      if (!burnEventFound) {
        console.error("No token transfer to burn address found in transaction logs");
        return res.status(400).json({ error: "Transaction does not transfer tokens to the designated burn address" });
      }

      // Use the bridge wallet to call burn. The contract's burn function takes (address from, uint256 amount).
      const bridgeWallet = new ethers.Wallet(BRIDGE_PRIVATE_KEY, polygonProvider);
      console.log("Bridge wallet address:", bridgeWallet.address);
      if (bridgeWallet.address.toLowerCase() !== WFLOP_DEPOSIT_ADDRESS.toLowerCase()) {
        console.error("Bridge wallet address does not match designated WFLOP deposit address.");
        return res.status(400).json({ error: "Bridge wallet address mismatch." });
      }
      
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, bridgeWallet);

      // Log the current token balance at the deposit address.
      const currentBalance = await contract.balanceOf(WFLOP_DEPOSIT_ADDRESS);
      console.log("Current token balance at deposit address:", currentBalance.toString());
      if (currentBalance.lt(burnAmount)) {
        console.error("Insufficient token balance at deposit address for burning. Expected at least:", burnAmount.toString());
        return res.status(400).json({ error: "Insufficient token balance at deposit address for burn" });
      }

      const currentGasPrice = await polygonProvider.getGasPrice();
      const adjustedGasPrice = currentGasPrice.mul(110).div(100);
      console.log("Using adjusted gas price for burn:", adjustedGasPrice.toString());

      console.log("Calling burn function on WFLOP contract for amount:", burnAmount.toString());
      let gasLimit;
      try {
        gasLimit = await contract.estimateGas.burn(WFLOP_DEPOSIT_ADDRESS, burnAmount, { gasPrice: adjustedGasPrice });
        console.log("Estimated gas for burn:", gasLimit.toString());
      } catch (err) {
        console.error("Gas estimation error for burn:", err);
        gasLimit = ethers.BigNumber.from("200000");
        console.log("Using fallback gas limit for burn:", gasLimit.toString());
      }

      const burnTx = await contract.burn(WFLOP_DEPOSIT_ADDRESS, burnAmount, { gasPrice: adjustedGasPrice, gasLimit });
      console.log("Burn transaction sent, tx hash:", burnTx.hash);

      console.log("Awaiting burn transaction confirmation...");
      let burnReceipt;
      try {
        burnReceipt = await pollTransactionReceipt(polygonProvider, burnTx.hash, 60000, 5000);
        console.log("Burn transaction confirmed, receipt:", burnReceipt);
      } catch (confirmError) {
        console.error("Burn confirmation error:", confirmError);
        return res.status(200).json({
          message: "Burn transaction sent, but not yet confirmed.",
          polygonTxHash: transactionHash,
          burnTxHash: burnTx.hash,
          burnAmount: burnAmount.toString(),
          warning: "Burn confirmation timed out, please check later.",
        });
      }

      // --- FLOP SIDE ---
      // Attempt to unlock the wallet before sending coins using walletpassphrase.
      const unlockPayload = {
        jsonrpc: "1.0",
        id: "walletpassphrase",
        method: "walletpassphrase",
        params: [WALLET_PASS, 60]
      };
      console.log("Attempting to unlock FLOP wallet...");
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

        if (unlockData.error) {
          // If the error is not error code -15 (unencrypted wallet), return an error.
          if (unlockData.error.code !== -15) {
            console.error("Wallet unlock error:", unlockData.error);
            return res.status(500).json({ error: "Wallet unlock error", details: unlockData.error });
          }
        } else {
          console.log("Wallet unlocked successfully.");
        }
      } catch (err) {
        console.error("Error during wallet unlock RPC call:", err);
        return res.status(500).json({ error: "Wallet unlock RPC call failed", details: err.message });
      }

      // Now send FLOP coins using sendtoaddress (using the RPC credentials as the node expects).
      const coinAmount = ethers.utils.formatUnits(burnAmount, 18); // convert burnAmount from wei to coin units
      const sendPayload = {
        jsonrpc: "1.0",
        id: "sendtoaddress",
        method: "sendtoaddress",
        params: [userAddress, coinAmount]
      };
      console.log("Sending FLOP coins to address:", userAddress, "amount:", coinAmount);
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
        console.error("Error parsing FLOP sendtoaddress response:", parseError);
        return res.status(500).json({ error: "FLOP sendtoaddress error", details: "Invalid JSON response" });
      }
      
      if (!sendResponse.ok || sendData.error) {
        console.error("FLOP sendtoaddress error:", sendData.error);
        return res.status(500).json({ error: "FLOP sendtoaddress error", details: sendData.error });
      }
      const flopTxHash = sendData.result;
      console.log("FLOP sendtoaddress transaction hash:", flopTxHash);

      // --- Store TXID as successfully processed ---
      await txCollection.insertOne({ txid: transactionHash, swapOption, createdAt: new Date() });

      return res.status(200).json({
        message: "Swap successful: WFLOP to FLOP",
        polygonTxHash: transactionHash,
        burnTxHash: burnTx.hash,
        flopTxHash,
        burnAmount: burnAmount.toString(),
        burnReceipt,
      });
    } else {
      return res.status(400).json({ error: "Invalid swap option" });
    }
  } catch (error) {
    console.error("Bridge swap error:", error);
    return res.status(500).json({ error: error.message });
  }
}
