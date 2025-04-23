# Small test example from docs of using sdk
  const traderGrades = await client.traderGrades.get({ 
    symbol: 'BTC,ETH', 
    startDate: tenDaysAgo.toISOString().split('T')[0], 
    endDate: yesterday.toISOString().split('T')[0] 
  });
  assert(traderGrades.data && traderGrades.data.length > 0, 'Trader grades endpoint failed');
  console.log(`✅ Trader grades endpoint: Retrieved ${traderGrades.data.length} grades`);



# Trader Grades API
import tmApi from '@api/tm-api';

tmApi.traderGrades({
  token_id: '3375%2C3306',
  startDate: '2023-10-01',
  endDate: '2023-10-10',
  symbol: 'BTC%2CETH',
  category: 'layer-1%2Cnft',
  exchange: 'binance%2Cgate',
  marketcap: '100',
  fdv: '100',
  volume: '100',
  traderGrade: '17',
  traderGradePercentChange: '0.14',
  limit: '2',
  page: '0',
  api_key: 'tm-********-****-****-****-************'
})
  .then(({ data }) => console.log(data))
  .catch(err => console.error(err));

Raw Response (EXAMPLE from api):
{
  "success": true,
  "message": "Data fetched successfully",
  "length": 2,
  "data": [
    {
      "TOKEN_ID": 17528,
      "TOKEN_NAME": "BTC",
      "DATE": "2023-10-10",
      "TA_GRADE": 14.09,
      "QUANT_GRADE": 35.7,
      "TM_TRADER_GRADE": 18.41,
      "TM_TRADER_GRADE_24H_PCT_CHANGE": 22.41
    },
    {
      "TOKEN_ID": 22600,
      "TOKEN_NAME": "ETH",
      "DATE": "2023-10-10",
      "TA_GRADE": 17.79,
      "QUANT_GRADE": 35.82,
      "TM_TRADER_GRADE": 21.39,
      "TM_TRADER_GRADE_24H_PCT_CHANGE": 0.97
    }
  ]
}