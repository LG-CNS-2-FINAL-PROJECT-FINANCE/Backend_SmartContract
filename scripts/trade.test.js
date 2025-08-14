// trade.test.js
const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const [deployer, seller, buyer] = await ethers.getSigners();

  // 이미 attach된 계약 불러오기
  const tokenAddress = process.env.CONTRACT_ADDRESS;
  const Token = await ethers.getContractFactory("FractionalInvestmentToken");
  const token = Token.attach(tokenAddress);

  console.log("--- Debug Permit Data ---");

  const tradeId = "trade_" + Date.now();
  const tokenAmount = 10;
  const tradeAmount = ethers.parseUnits(tokenAmount.toString(), 18);
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const nonce = await token.nonces(seller.address);
  const deadline = Math.floor(Date.now() / 1000) + 300; // 5분

  const tx0 = await token.connect(deployer).transferTokensFromContract(
    seller.address,
    tradeAmount
  );
  await tx0.wait();
  console.log("✅ seller get tokens for trading test");

  const domain = {
    name: await token.name(),
    version: "1",
    chainId,
    verifyingContract: tokenAddress,
  };

  const types = {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };

  const message = {
    owner: seller.address,
    spender: tokenAddress, // depositWithPermit 안에서 사용되는 spender 주소
    value: tradeAmount,
    nonce,
    deadline,
  };

  // 서명 생성
  const signature = await seller.signTypedData(domain, types, message);
  const recovered = ethers.verifyTypedData(domain, types, message, signature);

  console.log("Expected owner :", seller.address);
  console.log("Recovered signer:", recovered);
  console.log("Nonce           :", nonce.toString());
  console.log("Deadline        :", deadline);
  console.log("ChainId         :", chainId);
  console.log("VerifyingContract:", tokenAddress);

  if (recovered.toLowerCase() !== seller.address.toLowerCase()) {
    throw new Error("❌ Permit signature invalid!");
  }

  // 현재 잔고 / 허용량 확인
  const sellerBal = await token.balanceOf(seller.address);
  const allowance = await token.allowance(seller.address, tokenAddress);

  console.log("Seller balance  :", ethers.formatUnits(sellerBal, 18));
  console.log("Current allowance:", ethers.formatUnits(allowance, 18));

  // 1단계: depositWithPermit 호출
  console.log("\n--- Calling depositWithPermit ---");
  const tx1 = await token.connect(deployer).depositWithPermit(
    tradeId,
    seller.address,
    buyer.address,
    tokenAmount,
    deadline,
    signature.v || ethers.Signature.from(signature).v,
    signature.r || ethers.Signature.from(signature).r,
    signature.s || ethers.Signature.from(signature).s
  );
  await tx1.wait();
  console.log("✅ depositWithPermit executed");
  
  // deposit 후 중간 잔고 확인
  const midSellerBal = await token.balanceOf(seller.address);
  const midContractBal = await token.balanceOf(tokenAddress);
  console.log("Intermediate Seller balance:", ethers.formatUnits(midSellerBal, 18));
  console.log("Intermediate Contract balance:", ethers.formatUnits(midContractBal, 18));

  // ---
  
  // 2단계: requestTrade 호출
  // depositWithPermit()이 성공적으로 완료된 후, tradeId를 사용하여 requestTrade()를 호출합니다.
  console.log("\n--- Calling requestTrade ---");
  const tx2 = await token.connect(deployer).requestTrade(tradeId, buyer.address);
  await tx2.wait();
  console.log("✅ requestTrade executed");

  console.log("Transaction is pending Chainlink Functions fulfillment.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});