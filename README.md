# FlopSwap - Flopcoin Polygon Bridge

<div align="left">
    <strong>A secure and efficient bridge for swapping between FLOP and WFLOP tokens</strong>
</div>

## 🌉 Overview

FlopSwap is a decentralized bridge platform that enables seamless swapping between Flopcoin (FLOP) and Wrapped Flopcoin (WFLOP) on the Polygon network. This bridge provides a crucial link between the FLOP Layer-1 blockchain and Polygon's ecosystem, allowing users to utilize their FLOP tokens in the wider DeFi landscape.

### ✨ Features

- **Bi-directional Swapping**: Easily swap between FLOP and WFLOP tokens
- **MetaMask Integration**: Seamless connection with MetaMask for Polygon transactions
- **Secure Signature Verification**: Robust verification system for both FLOP and WFLOP transactions
- **Real-time Transaction Tracking**: Monitor your swap status with live updates
- **Responsive Design**: Full mobile and desktop support

## 🚀 Quick Start

### Prerequisites

- Node.js (Latest LTS version recommended)
- MetaMask wallet extension
- Flopcoin Core wallet (for FLOP transactions)
- MongoDB instance

### Installation

1. Clone the repository:
```bash
git clone https://github.com/TechnoVisionDev/FlopSwap.git
cd FlopSwap
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

3. Set up environment variables:
Create a `.env.local` file with the following variables:
```env
MONGODB_URI=your_mongodb_uri
MONGODB_DB=your_database_name
POLYGON_RPC_URL=your_polygon_rpc_url
CONTRACT_ADDRESS=your_wflop_contract_address
BRIDGE_PRIVATE_KEY=your_bridge_wallet_private_key
NEXT_PUBLIC_FLOP_DEPOSIT_ADDRESS=your_flop_deposit_address
NEXT_PUBLIC_WFLOP_DEPOSIT_ADDRESS=your_wflop_deposit_address
FLOP_RPC_PROTOCOL=http
FLOP_RPC_HOST=localhost
FLOP_RPC_PORT=your_port
FLOP_RPC_USER=your_rpc_user
FLOP_RPC_PASS=your_rpc_password
WALLET_PASS=your_wallet_password
```

4. Run the development server:
```bash
npm run dev
# or 
yarn dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

## 🔄 How It Works

### FLOP to WFLOP
1. Send FLOP to the designated deposit address
2. Sign the transaction using your Flopcoin Core wallet
3. Provide your Polygon address
4. Receive WFLOP tokens on the Polygon network

### WFLOP to FLOP
1. Connect your MetaMask wallet
2. Initiate the swap by providing your FLOP address
3. Sign the transaction using MetaMask
4. Receive FLOP in your Flopcoin Core wallet

## 🔗 Smart Contract

The WFLOP token contract is deployed on the Polygon network:
- Contract Address: [0xbc23545e7c51c5a0aa7bbbb8b530759e906a0982](https://polygonscan.com/address/0xbc23545e7c51c5a0aa7bbbb8b530759e906a0982)

## 🛠️ Technical Stack

- **Frontend**: Next.js, TailwindCSS
- **Backend**: Node.js, MongoDB
- **Blockchain**: Polygon Network, Flopcoin Core
- **Web3**: ethers.js
- **Authentication**: MetaMask

## 🔒 Security

FlopSwap implements several security measures:
- Signature verification for all transactions
- Duplicate transaction prevention
- Secure RPC connections
- MongoDB transaction tracking
- Gas price optimization for Polygon transactions

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

## 📜 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🔗 Links

- [Flopcoin Website](https://flopcoin.net)
- [Polygon Network](https://polygon.technology)
- [MetaMask](https://metamask.io)
