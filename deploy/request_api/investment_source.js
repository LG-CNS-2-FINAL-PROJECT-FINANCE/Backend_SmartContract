const requestId = args[0];

// 외부 API 호출
const apiResponse = await Functions.makeHttpRequest({
  url: `https://1d645917e1ef.ngrok-free.app/investment_payment/verify?id=${requestId}`
});

if (apiResponse.error) {
  console.error(apiResponse.error);
  throw Error("Request failed");
}

const { data } = apiResponse;

const result = data.data.result === true ? 1 : 0;

return Functions.encodeUint256(result);
