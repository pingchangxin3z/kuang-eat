## 获取地址list接口
fetch("https://order.hersweetie.com/feishu-api/address/list", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "zh-CN,zh;q=0.9",
    "openid": "ou_66c42c8cf53b96ecd83555138ed5c1df",
    "sec-ch-ua": "\"Not(A:Brand\";v=\"8\", \"Chromium\";v=\"144\", \"Google Chrome\";v=\"144\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"macOS\"",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin"
  },
  "referrer": "https://order.hersweetie.com/feishu/transferPool",
  "body": null,
  "method": "GET",
  "mode": "cors",
  "credentials": "include"
});

返回值示例：{
    "msg": "获取地址列表成功",
    "code": 200,
    "data": [
        {
            "id": 113,
            "detailAddress": "7层东侧吧台",
            "addressType": 0,
            "status": 0,
            "userId": null,
            "delFlag": "0",
            "createBy": "admin",
            "createTime": "2025-10-07T13:56:16",
            "updateBy": "",
            "updateTime": "2025-12-08T18:50:22",
            "remark": ""
        },
        {
            "id": 118,
            "detailAddress": "8层西侧吧台",
            "addressType": 0,
            "status": 0,
            "userId": null,
            "delFlag": "0",
            "createBy": "",
            "createTime": "2025-10-12T17:16:49",
            "updateBy": "",
            "updateTime": "2025-11-12T19:09:34",
            "remark": null
        },
        {
            "id": 119,
            "detailAddress": "9层东侧吧台",
            "addressType": 0,
            "status": 0,
            "userId": null,
            "delFlag": "0",
            "createBy": "",
            "createTime": "2025-10-19T10:42:22",
            "updateBy": "",
            "updateTime": "2025-11-12T19:09:50",
            "remark": null
        }
    ]
}

## 获取转让持list接口
fetch("https://order.hersweetie.com/feishu-api/v2/transferpool/list", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "zh-CN,zh;q=0.9",
    "content-type": "application/json;charset=UTF-8",
    "openid": "ou_66c42c8cf53b96ecd83555138ed5c1df",
    "sec-ch-ua": "\"Not(A:Brand\";v=\"8\", \"Chromium\";v=\"144\", \"Google Chrome\";v=\"144\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"macOS\"",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin"
  },
  "referrer": "https://order.hersweetie.com/feishu/transferPool",
  "body": "{\"orderDate\":\"20260314\",\"mealType\":\"\",\"addressId\":\"\"}",
  "method": "POST",
  "mode": "cors",
  "credentials": "include"
});

返回值示例：
{
    "code": 200,
    "msg": "查询转让池列表成功",
    "data": [
        {
            "id": 115256,
            "orderId": 1773456526545,
            "uid": 80,
            "userName": "杨宇彤",
            "department": "战略规划部",
            "orderDate": 20260314,
            "mealType": 2,
            "packageName": "南城香\n辣椒炒肉\n肉沫冬瓜\n烫拌菜花\n米饭",
            "sequenceChar": "A",
            "addressId": 119,
            "addressDetail": "9层东侧吧台",
            "qrCodeUrl": null,
            "orderStatus": 5,
            "cancelReason": null,
            "orderTime": "2026-03-14T02:48:46",
            "takeMealTime": null,
            "verifierId": null,
            "verifierName": null,
            "platform": 0,
            "createTime": "2026-03-14T10:48:47",
            "updateTime": "2026-03-14T13:00:25",
            "orderFrom": 1,
            "remark": null,
            "status": null
        }
    ]
}

## 获取转让池的餐
fetch("https://order.hersweetie.com/feishu-api/v2/transferpool/obtainOrder?orderId=1773456526545", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "zh-CN,zh;q=0.9",
    "openid": "ou_66c42c8cf53b96ecd83555138ed5c1df",
    "sec-ch-ua": "\"Not(A:Brand\";v=\"8\", \"Chromium\";v=\"144\", \"Google Chrome\";v=\"144\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"macOS\"",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin"
  },
  "referrer": "https://order.hersweetie.com/feishu/transferPool",
  "body": null,
  "method": "GET",
  "mode": "cors",
  "credentials": "include"
});