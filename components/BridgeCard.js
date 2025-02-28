// components/BridgeCard.js
import { useState } from 'react';
import { ethers } from 'ethers';

const CONTRACT_ADDRESS = "0xYourWrappedFlopcoinContractAddress"; // Replace with your deployed contract address
const CONTRACT_ABI = [
  "function mint(address to, uint256 amount) external",
  "function burn(address from, uint256 amount) external",
];

export default function BridgeCard({ provider, account }) {
  const [amount, setAmount] = useState("");
  const [action, setAction] = useState("wrap"); // "wrap" for FLOP → WFLOP, "unwrap" for WFLOP → FLOP
  const [txStatus, setTxStatus] = useState("");

  const handleSwap = async () => {
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      alert("Please enter a valid amount");
      return;
    }

    try {
      setTxStatus("Processing transaction...");
      const signer = provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const parsedAmount = ethers.utils.parseUnits(amount, 18); // assuming 18 decimals

      let tx;
      if (action === "wrap") {
        // Mint WFLOP tokens when wrapping
        tx = await contract.mint(account, parsedAmount);
      } else {
        // Burn WFLOP tokens when unwrapping
        tx = await contract.burn(account, parsedAmount);
      }
      await tx.wait();
      setTxStatus("Transaction successful!");
    } catch (error) {
      console.error(error);
      setTxStatus("Transaction failed");
    }
  };

  return (
    <div className="bg-white shadow-md rounded-lg p-6">
      <div className="flex mb-4">
        <button
          onClick={() => setAction("wrap")}
          className={`flex-1 px-4 py-2 rounded-l-lg ${action === "wrap" ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-800"}`}
        >
          Wrap (FLOP → WFLOP)
        </button>
        <button
          onClick={() => setAction("unwrap")}
          className={`flex-1 px-4 py-2 rounded-r-lg ${action === "unwrap" ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-800"}`}
        >
          Unwrap (WFLOP → FLOP)
        </button>
      </div>
      <div className="mb-4">
        <label className="block text-gray-700 mb-2">Amount</label>
        <input
          type="number"
          placeholder="0.0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg focus:outline-none"
        />
      </div>
      <button
        onClick={handleSwap}
        className="w-full bg-green-500 text-white py-2 rounded-lg"
      >
        {action === "wrap" ? "Wrap Tokens" : "Unwrap Tokens"}
      </button>
      {txStatus && <p className="mt-4 text-center">{txStatus}</p>}
    </div>
  );
}
