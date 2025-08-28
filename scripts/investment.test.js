// test/FractionalInvestmentToken.test.js
const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  if (hre.network.name === "hardhat") {
    console.warn("Running on Hardhat network. This script is intended for a live testnet.");
  }

  const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
  const SUBSCRIPTION_ID = process.env.CHAINLINK_FUNCTIONS_SUBSCRIPTIONS;
  const ROUTER_ADDRESS = process.env.SEPOLIA_FUNCTIONS_ROUTER;
  const DON_ID = process.env.SEPOLIA_DON_ID;

  if (!CONTRACT_ADDRESS || !SUBSCRIPTION_ID || !ROUTER_ADDRESS || !DON_ID) {
    console.error("All required environment variables must be set in your .env file.");
    process.exit(1);
  }

  const [deployer, otherAccount1, otherAccount2 ] = await ethers.getSigners();
  const provider = ethers.provider;

  console.log("--- Account Info ---");
  console.log("Deployer (Owner) Address:", deployer.address);
  console.log("Deployer ETH Balance:", ethers.formatEther(await provider.getBalance(deployer.address)));

  const FractionalInvestmentToken = await ethers.getContractFactory("FractionalInvestmentToken");
  const token = FractionalInvestmentToken.attach(CONTRACT_ADDRESS);

  console.log("FractionalInvestmentToken attached at:", await token.getAddress());

  console.log("\n--- Contract Configuration ---");
  const name = await token.name();
  const symbol = await token.symbol();
  const totalSupply = await token.totalSupply();
  const decimals = await token.decimals();

  console.log("Token Name:", name);
  console.log("Token Symbol:", symbol);
  console.log("Total Supply:", ethers.formatUnits(totalSupply, decimals));

console.log("\n--- Testing Multiple Investment Requests ---");

const investments = [
    {
      investId: `INV-1-${Date.now()}`,
      investmentor: deployer.address,
      tokenAmount: 20n,
      processState: false
    },
    {
      investId: `INV-2-${Date.now()}`,
      investmentor: otherAccount1.address,
      tokenAmount: 30n,
      processState: false
    },
    {
      investId: `INV-3-${Date.now()}`,
      investmentor: otherAccount2.address,
      tokenAmount: 50n,
      processState: false
    }
];

let totalRequestedAmount = 0n;
for (const inv of investments) {
  totalRequestedAmount += inv.tokenAmount;
}
const amountWithDecimals = totalRequestedAmount * (10n ** decimals);

const currentContractTokenBalance = await token.balanceOf(await token.getAddress());

if (currentContractTokenBalance < amountWithDecimals) {
  console.error("\nERROR: Contract does not have enough tokens for this request. Please check the contract's balance.");
  return;
}

try {
  console.log("Sending multiple investment requests to the live Chainlink network...");

  const requestInitialTx = await token.connect(deployer).requestInvestment(investments);
  const receiptInitial = await requestInitialTx.wait();
  console.log("Multiple Investment Request Tx Confirmed in block:", receiptInitial.blockNumber);

  const eventInitial = receiptInitial.logs.find(log => token.interface.parseLog(log)?.name === 'InvestmentRequested');
  if (eventInitial) {
    const reqId = eventInitial.args.chainlinkRequestId;
    console.log("   InvestmentRequested Event Fired!");
    console.log(`   Chainlink Request ID: ${reqId}`);
    console.log("Waiting for Chainlink to process the request (approx. 60 seconds)...");

    // 실제 Chainlink 콜백을 기다림
    await new Promise(resolve => setTimeout(resolve, 60000));
    
    console.log("\n--- After Chainlink Callback ---");

    for (const inv of investments) {
      const balanceAfter = await token.balanceOf(inv.investmentor);
      const isProcessed = (await token.investmentRecord(inv.investId)).processState;
      
      console.log(`\nAccount ${inv.investmentor.substring(0, 8)}...'s Token Balance:`, ethers.formatUnits(balanceAfter, decimals));
      console.log(`Investment ID "${inv.investId}" Process State:`, isProcessed);

      if (isProcessed) {
        console.log("Test Passed for investment:", inv.investId);
      } else {
        console.error("Test Failed for investment:", inv.investId);
      }
    }

  } else {
    console.error("InvestmentRequested event not found.");
  }
} catch (error) {
  console.error("\n--- Error during Multiple Investment Request ---");
  console.error("Error Message:", error);
}
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});