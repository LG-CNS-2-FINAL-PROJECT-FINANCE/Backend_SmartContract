const tradeId = args[0];

// 외부 API 호출
const apiResponse = await Functions.makeHttpRequest({
  url: `https://1d645917e1ef.ngrok-free.app/trade_payment/verify?id=${tradeId}`
});

if (apiResponse.error) {
  console.error(apiResponse.error);
  throw Error("Request failed");
}

const { data } = apiResponse;

const result = data.data.result === true ? 1 : 0;

return Functions.encodeUint256(result);
