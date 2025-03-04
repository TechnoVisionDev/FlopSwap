import { useState, useEffect } from "react";
import { ethers } from "ethers";

export default function Home() {
  // The Ethereum wallet address that will sign the message (only used for WFLOP → FLOP).
  const [signerAddress, setSignerAddress] = useState("");
  // The target address where the tokens/coins should be sent.
  // For FLOP → WFLOP, this is the Polygon address.
  // For WFLOP → FLOP, this is the FLOP address.
  const [targetAddress, setTargetAddress] = useState("");
  // The transaction ID.
  // For FLOP → WFLOP, this is the FLOP deposit TXID.
  // For WFLOP → FLOP, this is the burn TXID.
  const [txid, setTxid] = useState("");
  // The signature produced by signing the TXID (only for WFLOP → FLOP).
  const [signature, setSignature] = useState("");
  // We use the TXID as the signed message (only for WFLOP → FLOP).
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

  // Function to connect wallet if not already connected.
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

  // Function to sign the TXID automatically (only used for WFLOP → FLOP)
  const signTxid = async (currentProvider, txidToSign) => {
    try {
      const signer = currentProvider.getSigner();
      // Use the TXID as the message.
      const message = txidToSign;
      const sig = await signer.signMessage(message);
      setSignature(sig);
      setSignMessageText(message);
      return sig;
    } catch (err) {
      console.error("Error signing message:", err);
      throw new Error("Failed to sign message");
    }
  };

  // Combined submit handler: connect wallet, sign TXID if needed, then submit.
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!txid || !targetAddress) {
      alert("Please fill in all required fields.");
      return;
    }
    setIsLoading(true);
    setStatus("Processing transaction...");
    setStatusType("");

    try {
      // Ensure wallet is connected.
      const connectedAddress = await ensureWalletConnected();

      let sig = "";
      // Only sign the TXID if the flow is WFLOP → FLOP.
      if (swapOption === "WFLOP_TO_FLOP") {
        sig = await signTxid(provider, txid);
      }

      // Prepare the payload.
      const payload = {
        transactionHash: txid,
        signerAddress: connectedAddress,
        targetAddress,
        swapOption,
        // For WFLOP → FLOP include signature; for FLOP → WFLOP send empty strings.
        signature: swapOption === "WFLOP_TO_FLOP" ? sig : "",
        signMessageText: swapOption === "WFLOP_TO_FLOP" ? txid : ""
      };

      // Submit the payload to the backend.
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
    <div className="min-h-screen bg-[#212121] flex flex-col items-center justify-center p-4">
      <div className="mb-4 flex space-x-2">
        <button
          onClick={() => {
            setSwapOption("FLOP_TO_WFLOP");
            setTxid("");
            setTargetAddress("");
            setSignature("");
            setSignMessageText("");
          }}
          className={`px-4 py-2 rounded ${swapOption === "FLOP_TO_WFLOP" ? "bg-blue-500 text-white" : "bg-gray-300 text-black"}`}
        >
          FLOP to WFLOP
        </button>
        <button
          onClick={() => {
            setSwapOption("WFLOP_TO_FLOP");
            setTxid("");
            setTargetAddress("");
            setSignature("");
            setSignMessageText("");
          }}
          className={`px-4 py-2 rounded ${swapOption === "WFLOP_TO_FLOP" ? "bg-blue-500 text-white" : "bg-gray-300 text-black"}`}
        >
          WFLOP to FLOP
        </button>
      </div>
      <div className="max-w-3xl w-full bg-white shadow-md rounded-lg p-6">
        <h1 className="text-3xl font-bold mb-8 text-center text-[#212121]">
          {swapOption === "FLOP_TO_WFLOP" ? "FLOP to WFLOP Bridge" : "WFLOP to FLOP Bridge"}
        </h1>
        {swapOption === "FLOP_TO_WFLOP" ? (
          <>
            <p className="mb-4 text-center text-black">
              To swap FLOP to WFLOP, send Flopcoin (FLOP) to the deposit address below:
            </p>
            <p className="font-mono text-blue-600 text-center mb-4">
              {process.env.NEXT_PUBLIC_FLOP_DEPOSIT_ADDRESS}
            </p>
            <p className="mb-4 text-center text-black">
              Once the deposit is confirmed, enter the Polygon address where you’d like to receive your WFLOP tokens and the Flopcoin transaction ID for the deposit you just made.
            </p>
            <label className="block text-gray-700 mb-2">Polygon Address:</label>
            <input
              type="text"
              value={targetAddress}
              onChange={(e) => setTargetAddress(e.target.value)}
              placeholder="Enter Polygon Address"
              className="w-full text-black p-2 border border-gray-300 rounded mb-4"
              disabled={isLoading}
            />
          </>
        ) : (
          <>
            <p className="mb-4 text-center text-black">
              To swap WFLOP to FLOP, send Wrapped Flopcoin (WFLOP) to the deposit address below:
            </p>
            <p className="font-mono text-blue-600 text-center mb-4">
              {process.env.NEXT_PUBLIC_WFLOP_DEPOSIT_ADDRESS}
            </p>
            <p className="mb-4 text-center text-black">
              Once the deposit is confirmed, enter the Flopcoin address where you’d like to receive your FLOP coins and the Polygon transaction ID for the deposit you just made.
            </p>
            <label className="block text-gray-700 mb-2">Flopcoin Address:</label>
            <input
              type="text"
              value={targetAddress}
              onChange={(e) => setTargetAddress(e.target.value)}
              placeholder="Enter FLOP Address"
              className="w-full text-black p-2 border border-gray-300 rounded mb-4"
              disabled={isLoading}
            />
          </>
        )}
        <label className="block text-gray-700 mb-2">Deposit Transaction ID:</label>
        <input
          type="text"
          value={txid}
          onChange={(e) => setTxid(e.target.value)}
          placeholder="Enter TXID"
          className="w-full p-2 border text-black border-gray-300 rounded mb-4"
          disabled={isLoading}
        />
        <form onSubmit={handleSubmit}>
          <button
            type="submit"
            className="w-full bg-green-500 text-white px-6 py-3 rounded-md flex items-center justify-center"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-5 w-5 mr-2 text-white" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                </svg>
                Processing...
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
