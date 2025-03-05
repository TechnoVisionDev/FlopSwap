import { useState, useEffect } from "react";
import { ethers } from "ethers";
import Image from "next/image";

export default function Home() {
  // For WFLOP → FLOP: automatically get the signing address from MetaMask.
  const [signerAddress, setSignerAddress] = useState("");
  // For FLOP → WFLOP: user must manually provide their FLOP wallet address.
  const [flopSignerAddress, setFlopSignerAddress] = useState("");

  // The target address where tokens/coins should be sent.
  // For FLOP → WFLOP, this is the Polygon address.
  // For WFLOP → FLOP, this is the FLOP address.
  const [targetAddress, setTargetAddress] = useState("");
  // The transaction ID.
  const [txid, setTxid] = useState("");
  // The signature produced by signing the TXID.
  // For WFLOP → FLOP, this is automatically produced via MetaMask.
  // For FLOP → WFLOP, the user must input the signature from their FLOP wallet.
  const [signature, setSignature] = useState("");
  // We use the TXID as the signed message.
  const [signMessageText, setSignMessageText] = useState("");
  // Swap option: either "FLOP_TO_WFLOP" or "WFLOP_TO_FLOP"
  const [swapOption, setSwapOption] = useState("FLOP_TO_WFLOP");
  // Status display
  const [status, setStatus] = useState("");
  const [statusType, setStatusType] = useState(""); // "success" or "error"
  const [isLoading, setIsLoading] = useState(false);

  // Ethers provider from MetaMask (used only for WFLOP → FLOP)
  const [provider, setProvider] = useState(null);
  useEffect(() => {
    if (typeof window !== "undefined" && window.ethereum) {
      const prov = new ethers.providers.Web3Provider(window.ethereum);
      setProvider(prov);
    }
  }, []);

  // For WFLOP → FLOP: Connect wallet if not already connected.
  const ensureWalletConnected = async () => {
    if (!window.ethereum) {
      alert("Please install MetaMask.");
      throw new Error("MetaMask not installed");
    }
    if (!signerAddress) {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      setSignerAddress(accounts[0]);
      return accounts[0];
    }
    return signerAddress;
  };

  // Function to autopopulate the Polygon address field using MetaMask
  const useMetaMaskAddress = async () => {
    try {
      const addr = await ensureWalletConnected();
      setTargetAddress(addr);
    } catch (error) {
      console.error("Error fetching MetaMask address:", error);
    }
  };

  // Function to copy a given address to the clipboard
  const handleCopy = (address) => {
    navigator.clipboard.writeText(address);
  };

  // For WFLOP → FLOP: sign the TXID automatically via MetaMask.
  // Modified to handle errors gracefully.
  const signTxid = async (currentProvider, txidToSign) => {
    try {
      const signer = currentProvider.getSigner();
      const message = txidToSign;
      const sig = await signer.signMessage(message);
      setSignature(sig);
      setSignMessageText(message);
      return sig;
    } catch (err) {
      console.error("Error signing message:", err);
      setStatus("Failed to sign message");
      setStatusType("error");
      setIsLoading(false);
      return null;
    }
  };

  // Handle submission for both flows.
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!txid || !targetAddress) {
      alert("Please fill in all required fields.");
      return;
    }
    // For FLOP → WFLOP, also require the FLOP wallet address and signature.
    if (swapOption === "FLOP_TO_WFLOP" && (!flopSignerAddress || !signature)) {
      alert("Please fill in your FLOP wallet address and signature.");
      return;
    }
    setIsLoading(true);
    setStatus("Processing transaction...");
    setStatusType("");

    try {
      let payload = {};
      if (swapOption === "WFLOP_TO_FLOP") {
        // Use MetaMask to sign.
        const connectedAddress = await ensureWalletConnected();
        const sig = await signTxid(provider, txid);
        if (!sig) {
          // If signing fails, exit early.
          return;
        }
        payload = {
          transactionHash: txid,
          signerAddress: connectedAddress,
          targetAddress,
          swapOption,
          signature: sig,
          signMessageText: txid,
        };
      } else {
        // FLOP → WFLOP: use manually provided FLOP wallet address and signature.
        payload = {
          transactionHash: txid,
          signerAddress: flopSignerAddress,
          targetAddress,
          swapOption,
          signature: signature,
          signMessageText: txid,
        };
      }

      const response = await fetch("/api/bridge-swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (response.ok) {
        setStatusType("success");
        if (swapOption === "WFLOP_TO_FLOP") {
          setStatus(`${data.message} ${data.flopDepositTxHash || ""}`);
        } else {
          setStatus(`${data.message} ${data.polygonTxHash || ""}`);
        }
      } else {
        setStatusType("error");
        setStatus(data.error);
      }
    } catch (error) {
      console.error("Error in handleSubmit:", error);
      setStatusType("error");
      setStatus(error.message || "An unexpected issue occurred. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#212121] flex flex-col items-center p-4">
      <div className="mb-4 flex space-x-2">
        <button
          onClick={() => {
            setSwapOption("FLOP_TO_WFLOP");
            setTxid("");
            setTargetAddress("");
            setSignature("");
            setSignMessageText("");
            setFlopSignerAddress("");
            setStatus("");
            setStatusType("");
          }}
          className={`px-4 py-2 rounded ${swapOption === "FLOP_TO_WFLOP" ? "h-12 bg-blue-500 text-white" : "bg-gray-300 text-black"}`}
        >
          <span>FLOP</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 inline mx-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
          <span>WFLOP</span>
        </button>
        <button
          onClick={() => {
            setSwapOption("WFLOP_TO_FLOP");
            setTxid("");
            setTargetAddress("");
            setSignature("");
            setSignMessageText("");
            setStatus("");
            setStatusType("");
          }}
          className={`px-4 py-2 rounded ${swapOption === "WFLOP_TO_FLOP" ? "h-12 bg-blue-500 text-white" : "bg-gray-300 text-black"}`}
        >
          <span>WFLOP</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 inline mx-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
          <span>FLOP</span>
        </button>
      </div>
      <div className="max-w-3xl w-full bg-white shadow-md rounded-lg p-6">
        <h1 className="text-3xl font-bold mb-8 text-center text-[#212121]">
          {swapOption === "FLOP_TO_WFLOP" ? "FLOP to WFLOP Bridge" : "WFLOP to FLOP Bridge"}
        </h1>
        {swapOption === "FLOP_TO_WFLOP" ? (
          <>
            <div className="mb-4 text-left text-black">
              <p className="mb-4">
                <b>1.)</b> To swap FLOP to WFLOP, send Flopcoin (FLOP) to the deposit address below.
                Make sure to use the Flopcoin Core wallet for this transaction!
              </p>
              <div className="flex items-center mb-4">
                <p className="font-mono text-blue-600 text-left">
                  {process.env.NEXT_PUBLIC_FLOP_DEPOSIT_ADDRESS}
                </p>
                <button
                  type="button"
                  onClick={() => handleCopy(process.env.NEXT_PUBLIC_FLOP_DEPOSIT_ADDRESS)}
                  className="ml-2 px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded"
                  title="Copy Address To Clipboard"
                >
                  Copy
                </button>
              </div>
              <p className="mt-2">
                <span className="font-bold">2.)</span> Once the deposit is confirmed, enter your Flopcoin Core wallet address, the Polygon (POL) address where you would like to receive your WFLOP, and the FLOP transaction ID for the deposit you just made.
              </p>
              <p className="mt-2">
                <span className="font-bold">3.)</span> To prove you made the deposit, you must sign a message using your Flopcoin Core wallet. The message <strong>MUST</strong> only contain the exact TXID as you specified here. Make sure you sign using the wallet address you used to deposit your coins to the bridge.
              </p>
            </div>
            <label className="block text-gray-700 mb-2">Polygon Address:</label>
            <div className="flex items-center mb-4">
              <input
                type="text"
                value={targetAddress}
                onChange={(e) => setTargetAddress(e.target.value)}
                placeholder="Enter Polygon Address to Receive WFLOP"
                className="w-full text-black p-2 border border-gray-300 rounded"
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={useMetaMaskAddress}
                className="ml-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded"
                disabled={isLoading}
              >
                MetaMask
              </button>
            </div>
            <label className="block text-gray-700 mb-2">Flopcoin Core Address:</label>
            <input
              type="text"
              value={flopSignerAddress}
              onChange={(e) => setFlopSignerAddress(e.target.value)}
              placeholder="Enter Your Flopcoin Core Address"
              className="w-full text-black p-2 border border-gray-300 rounded mb-4"
              disabled={isLoading}
            />
            <label className="block text-gray-700 mb-2">Deposit Transaction ID:</label>
            <input
              type="text"
              value={txid}
              onChange={(e) => setTxid(e.target.value)}
              placeholder="Enter Deposit TXID"
              className="w-full p-2 border text-black border-gray-300 rounded mb-4"
              disabled={isLoading}
            />
            <label className="block text-gray-700 mb-2">Signature (Base64):</label>
            <input
              type="text"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="Enter Signature From FLOP Wallet"
              className="w-full text-black p-2 border border-gray-300 rounded mb-4"
              disabled={isLoading}
            />
          </>
        ) : (
          <>
            <p className="mb-4 text-left text-black">
              <b>1.)</b> To swap WFLOP to FLOP, send Wrapped Flopcoin (WFLOP) to the deposit address below using the Polygon network.
              Make sure to use a MetaMask account for this transaction!
            </p>
            <div className="flex items-center mb-4">
              <p className="font-mono text-blue-600 text-left">
                {process.env.NEXT_PUBLIC_WFLOP_DEPOSIT_ADDRESS}
              </p>
              <button
                type="button"
                onClick={() => handleCopy(process.env.NEXT_PUBLIC_WFLOP_DEPOSIT_ADDRESS)}
                className="ml-2 px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded"
                title="Copy Address To Clipboard"
              >
                Copy
              </button>
            </div>
            <p className="mb-4 text-left text-black">
              <b>2.)</b> Once the deposit is confirmed, enter the Flopcoin address where you’d like to receive your FLOP coins and the Polygon transaction ID for the deposit you just made. You will be asked to sign the transaction using MetaMask so make sure it is installed.
            </p>
            <label className="block text-gray-700 mb-2">Flopcoin Address:</label>
            <input
              type="text"
              value={targetAddress}
              onChange={(e) => setTargetAddress(e.target.value)}
              placeholder="Enter Flopcoin Address to Receive FLOP"
              className="w-full text-black p-2 border border-gray-300 rounded mb-4"
              disabled={isLoading}
            />
            <label className="block text-gray-700 mb-2">Deposit Transaction ID:</label>
            <input
              type="text"
              value={txid}
              onChange={(e) => setTxid(e.target.value)}
              placeholder="Enter Deposit TXID"
              className="w-full p-2 border text-black border-gray-300 rounded mb-4"
              disabled={isLoading}
            />
          </>
        )}
        <form onSubmit={handleSubmit}>
          <button
            type="submit"
            className="w-full bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-md flex items-center justify-center"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-5 w-5 mr-2 text-white" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                </svg>
              </>
            ) : (
              "Submit Transaction"
            )}
          </button>
        </form>
        <p className={`mt-4 text-center ${statusType === "success" ? "text-green-500" : statusType === "error" ? "text-red-500" : "text-black"}`}>
          {status}
        </p>
      </div>
    </div>
  );
}
