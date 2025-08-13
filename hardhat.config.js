require("@nomicfoundation/hardhat-toolbox");
require("hardhat-deploy");
require("hardhat-tracer");
require("dotenv").config();

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200 // runs 값을 낮추면 크기는 줄어들지만 실행 가스비가 늘어날 수 있음
      }
    }
  },
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: [
        process.env.PRIVATE_KEY_ADMIN,
        process.env.PRIVATE_KEY_USER1,
        process.env.PRIVATE_KEY_USER2,
      ].filter(key => key !== undefined),
      chainId: 11155111,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  sourcify: {
    enabled: true
  }
};