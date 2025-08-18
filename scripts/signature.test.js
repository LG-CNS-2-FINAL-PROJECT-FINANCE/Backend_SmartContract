require("dotenv").config();

// 서명을 위한 지갑 설정 (실제 환경에서는 MetaMask 등 연결)
const ethers = require("ethers");
const privateKey = process.env.PRIVATE_KEY_USER1;
const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const wallet = new ethers.Wallet(privateKey, provider);

const responseData = {
    "domain": {
        "name": "Local Test Fractional Investment Token",
        "version": "1",
        "chainId": 11155111,
        "verifyingContract": "0xD94E343706B6f266feB663D6696a34b30ff4B121"
    },
    "message": {
        "owner": "0xBEe09296623Dee35Ae2570De33B6ba017bc2d4d9",
        "spender": "0xD94E343706B6f266feB663D6696a34b30ff4B121",
        "value": 100000000000000000000,
        "nonce": 0,
        "deadline": 1755435902
    },
    "types": {
        "Permit": [
            { "name": "owner", "type": "address" },
            { "name": "spender", "type": "address" },
            { "name": "value", "type": "uint256" },
            { "name": "nonce", "type": "uint256" },
            { "name": "deadline", "type": "uint256" }
        ]
    }
};

async function signData() {
    try {
        
        // EIP-712 서명을 위한 메시지 데이터 복사 및 변환
        const messageForSigning = { ...responseData.message };
        
        // **문제가 되는 'value' 값을 BigInt로 변환**
        messageForSigning.value = BigInt(responseData.message.value);

        // EIP-712 Typed Data 서명
        const signature = await wallet.signTypedData(
            responseData.domain,
            responseData.types,
            messageForSigning
        );

        console.log("생성된 서명:", signature);

        // 서명 검증 (선택 사항)
        const recoveredAddress = ethers.verifyTypedData(
            responseData.domain,
            responseData.types,
            messageForSigning,
            signature
        );

        console.log("복구된 주소:", recoveredAddress);
        console.log("원래 주소:", wallet.address);

        if (recoveredAddress.toLowerCase() === wallet.address.toLowerCase()) {
            console.log("✅ 서명 검증 성공!");
        } else {
            console.error("❌ 서명 검증 실패!");
        }

        const v = ethers.Signature.from(signature).v; // 서명에서 v 값을 추출
        const r = ethers.Signature.from(signature).r; // 서명에서 r 값을 추출
        const s = ethers.Signature.from(signature).s; // 서명에서 s 값을 추출

        console.log("v:", v);
        console.log("r:", r);
        console.log("s:", s);
    } catch (error) {
        console.error("서명 중 오류 발생:", error);
    }
}

signData();