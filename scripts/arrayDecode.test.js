// scripts/arrayDecode.test.js
import { ethers } from "ethers";

// ✅ ethers ABI coder 사용
function abiEncodeArray(uint256Array) {
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    return abiCoder.encode(["uint256[]"], [uint256Array]);
}

// ✅ 테스트할 값
const sampleArray = [1, 0, 1, 1, 0];
const encoded = abiEncodeArray(sampleArray);

console.log("Encoded (hex):", encoded);

// ✅ ethers.js ABI coder로 디코딩
const abiCoder = ethers.AbiCoder.defaultAbiCoder();
const decoded = abiCoder.decode(["uint256[]"], encoded);

console.log("Decoded:", decoded[0].map(n => n.toString()));
console.log(
    "Matches:",
    JSON.stringify(decoded[0].map(n => Number(n))) === JSON.stringify(sampleArray)
);
