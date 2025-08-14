const { ethers } = require("hardhat");
require("dotenv").config();
const { GelatoRelay } = require("@gelatonetwork/relay-sdk");

async function main() {
  // Hardhat 네트워크를 리셋하여 깨끗한 상태에서 테스트 시작
  if (hre.network.name === "hardhat") {
    await hre.network.provider.send("hardhat_reset");
  }

  const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
  const GELATO_API_KEY = process.env.GELATO_API_KEY;

  if (!CONTRACT_ADDRESS || !GELATO_API_KEY) {
    console.error("CONTRACT_ADDRESS and GELATO_API_KEY must be set in your .env file.");
    process.exit(1);
  }

  const [deployer] = await ethers.getSigners();
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
  const totalInvestmentAmount = await token.totalInvestmentAmount();
  const minInvestmentAmount = await token.minInvestmentAmount();
  const totalTokenAmount = await token.totalTokenAmount();
  const contractOwner = await token.owner();
  const contractTokenBalance = await token.balanceOf(await token.getAddress());

  console.log("Token Name:", name);
  console.log("Token Symbol:", symbol);
  console.log("Total Supply:", ethers.formatUnits(totalSupply, await token.decimals()));
  console.log("Total Investment Amount (원):", totalInvestmentAmount.toString());
  console.log("Min Investment Amount (원):", minInvestmentAmount.toString());
  console.log("Calculated Total Token Amount (개수):", totalTokenAmount.toString());
  console.log("Contract Owner Address:", contractOwner);
  console.log("Contract's Token Balance:", ethers.formatUnits(contractTokenBalance, await token.decimals()));

  // --- 1. 1차 발행 (Initial Investment) 테스트 ---
  console.log("\n--- Testing Initial Investment Request ---");

  const investmentId = ethers.encodeBytes32String("invest_" + Math.floor(Math.random() * 1000000).toString());
  const investmentBuyer = deployer.address;
  const investmentTokens = 20n;
  const decimals = await token.decimals();

  const currentContractTokenBalance = await token.balanceOf(await token.getAddress());
  const amountWithDecimals = investmentTokens * (10n ** decimals);

  console.log(`Current Contract Token Balance: ${ethers.formatUnits(currentContractTokenBalance, decimals)}`);
  console.log(`Requested Amount: ${ethers.formatUnits(amountWithDecimals, decimals)}`);

  if (currentContractTokenBalance < amountWithDecimals) {   
      console.error("\nERROR: Contract does not have enough tokens for this request. Please check the contract's balance.");
      return;
  }

  console.log(`Requesting initial investment for ${investmentBuyer} with ${investmentTokens} tokens...`);
  console.log(`investmentId: ${ethers.hexlify(investmentId)}`);

  try {
    const requestInitialTx = await token.connect(deployer).requestInvestment(
      investmentId,
      investmentBuyer,
      investmentTokens
    );
    const receiptInitial = await requestInitialTx.wait();
    console.log("Initial Investment Request Tx Confirmed in block:", receiptInitial.blockNumber);

    const eventInitial = receiptInitial.logs.find(log => token.interface.parseLog(log)?.name === 'InvestmentRequested');
    if (eventInitial) {
      console.log("InvestmentRequested Event Fired!");
      console.log("   Chainlink Request ID:", eventInitial.args.chainlinkRequestId);
      console.log("   Buyer:", eventInitial.args.buyer);
      console.log("   Token Amount:", ethers.formatUnits(eventInitial.args.tokenAmount, decimals));
    } else {
      console.log("InvestmentRequested event not found.");
    }
    
    console.log("Waiting for 30 seconds for initial investment fulfillment (simulate Chainlink callback)...");
    await new Promise(resolve => setTimeout(resolve, 30000));

    const deployerBalanceAfterInitial = await token.balanceOf(deployer.address);
    console.log(`\n--- After Initial Investment Fulfillment (Manual Check) ---`);
    console.log(`deployer (${deployer.address})'s Token Balance:`, ethers.formatUnits(deployerBalanceAfterInitial, decimals));
    console.log(`Contract's Token Balance:`, ethers.formatUnits(await token.balanceOf(await token.getAddress()), decimals));

  } catch (error) {
    console.error("\n--- Error during Initial Investment Request ---");
    console.error("Error Message:", error);
    return;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
