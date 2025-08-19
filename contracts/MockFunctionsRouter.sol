// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// FunctionsClient가 응답을 보내기 위해 사용하는 인터페이스를 모방합니다.
interface IFunctionsClient {
    function fulfillRequest(bytes32 requestId, bytes memory response, bytes memory err) external;
    function handleOracleFulfillment(bytes32 requestId, bytes memory response, bytes memory err) external;
}

contract MockFunctionsRouter {
    // 요청 ID를 요청을 보낸 컨트랙트 주소에 매핑
    mapping(bytes32 => address) public s_requestIds;

    // 테스트를 위해 모킹된 이벤트
    event RequestSent(bytes32 requestId, bytes source);
    event Fulfilled(bytes32 requestId, bytes response, bytes err);

    /**
     * @notice FunctionsClient의 _sendRequest 함수가 호출하는 시그니처와 동일하게 수정합니다.
     * @dev 이 함수는 실제로 체인링크 라우터가 받는 인자들과 일치해야 합니다.
     * @param subscriptionId 요청에 사용될 구독 ID
     * @param data CBOR로 인코딩된 요청 데이터
     * @param dataVersion 요청 데이터의 버전
     * @param callbackGasLimit 콜백 함수에 허용되는 가스 한도
     * @param donId 분산 오라클 네트워크 ID
     * @return requestId 생성된 요청 ID
     */
    function sendRequest(
        uint64 subscriptionId,
        bytes calldata data,
        uint16 dataVersion,
        uint32 callbackGasLimit,
        bytes32 donId
    ) external returns (bytes32 requestId) {
        requestId = keccak256(
            abi.encodePacked(block.timestamp, msg.sender, data)
        );
        s_requestIds[requestId] = msg.sender;
        emit RequestSent(requestId, data);
        return requestId;
    }

    /**
     * @notice 요청을 보낸 컨트랙트의 handleOracleFulfillment 함수를 호출합니다.
     * @dev 테스트를 위해 MockFunctionsRouter에서 직접 호출하여 오라클의 역할을 모방합니다.
     * @param requestId 처리할 요청 ID
     * @param response 오프체인 실행의 응답 데이터
     * @param err 오프체인 실행의 오류 데이터
     */
    function fulfillRequest(
        bytes32 requestId,
        bytes calldata response,
        bytes calldata err
    ) external {
        address callbackContract = s_requestIds[requestId];
        require(callbackContract != address(0), "Request ID not found");
        
        // ICallback 대신 IFunctionsClient의 handleOracleFulfillment를 호출합니다.
        // 이 함수 호출은 실제 오라클의 응답을 모방하는 역할을 합니다.
        IFunctionsClient(callbackContract).handleOracleFulfillment(requestId, response, err);
        
        emit Fulfilled(requestId, response, err);
    }
}
