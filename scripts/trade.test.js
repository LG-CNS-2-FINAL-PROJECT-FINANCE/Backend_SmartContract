// deploy.js 파일 예시
const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
    const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;

    if (!CONTRACT_ADDRESS) {
        console.error("CONTRACT_ADDRESS must be set in your .env file.");
        process.exit(1);
    }

    // 테스트용 계정 설정 (Seller, Buyer, Relayer)
    const [deployer, seller, buyer] = await ethers.getSigners();
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
    
    // --- 2차 거래 시뮬레이션 ---
    console.log("\n--- Simulating a secondary trade ---");
    
    // 배포 시 컨트랙트 주소에 발행된 토큰을 seller에게 미리 전송합니다.
    const initialTransferAmount = ethers.parseEther("50");
    const mintTx = await token.transferTokensFromContract(seller.address, initialTransferAmount);
    await mintTx.wait();
    console.log(`Transferred ${ethers.formatEther(initialTransferAmount)} tokens to seller: ${seller.address}`);

    // Seller가 Relayer(컨트랙트)에게 토큰 전송을 승인하는 서명을 생성합니다.
    // 이는 오프체인에서 이루어지는 단계입니다.
    const contractAddress = await token.getAddress();
    const tokenAmount = 10;
    const tradeAmount = ethers.parseEther(tokenAmount.toString()); // (Ether -> Wei) (N -> N * 10^18)
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1시간 후 만료
    const value = tradeAmount;
    console.log(`Signature Data : value=${tradeAmount}, deadline=${deadline}`);

    // permit 서명을 위한 데이터 준비
    const domain = {
        name: await token.name(),
        version: "1",
        chainId: (await provider.getNetwork()).chainId,
        verifyingContract: contractAddress,
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

    const nonce = await token.nonces(seller.address);
    const message = {
        owner: seller.address,
        spender: contractAddress,
        value: value,
        nonce: nonce,
        deadline: deadline,
    };

    // Seller가 서명합니다.
    const signature = await seller.signTypedData(domain, types, message);
    const { v, r, s } = ethers.Signature.from(signature);
    console.log("Permit signature created by seller.");

    // Relayer(여기서는 relayer 계정)가 서명과 함께 requestTradeWithPermit을 호출합니다.
    const tradeId = "trade_" + Date.now();
    console.log("Relayer calling requestTradeWithPermit...");
    const tradeTx = await token.connect(deployer).requestTradeWithPermit(
        tradeId,
        seller.address,
        buyer.address,
        tokenAmount, // tokenAmount (단위 없는 값)
        deadline,
        v,
        r,
        s
    );
    await tradeTx.wait();
    console.log("requestTradeWithPermit transaction sent by relayer.");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
