# Stage 1 APIs

The sEURO offering is the first stage in the IBCO process. Users can obtain sEURO in exchange for ETH or some accepted ERC20 tokens, at a discount which gradually reaches full price during the period of the IBCO.

### sEURO Offering Public APIs

These are the functions exposed to the user in Stage 1.

**readOnlyCalculateSwap(bytes32 _token, uint256 _amount)**
*Description*: estimates a price for given amount of given token
*Input*:
- symbol of accepted token as a 32-byte array (provided by **TokenManager**)
- amount of provided token to estimate conversion into sEURO
*Output*: an estimate in sEURO given the input

**swap(bytes32 _token, uint256 _amount)**
*Description*:
- swaps the given amount of given token for equivalent sEURO, transferred to user
- user must approve **SEuroOffering** contract for given amount of token
*Input*:
- symbol of accepted token as a 32-byte array (provided by **TokenManager**)
- amount of provided token to swap into sEURO

**swapETH()**
*Description*: payable function that swaps ETH value of message for equivalent sEURO

### Token Manager Public APIs

These are the functions exposed to the user in Stage 1.
**getAcceptedTokens()**
*Description*: provides list of all ERC20 tokens that are swappable for sEURO
*Output*: list of 32-byte array representations of token symbols e.g. `0x5553445400000000000000000000000000000000000000000000000000000000` = `WETH`

**get(bytes32 _name)**
*Description*:
- provides details for the accepted token: 
- TODO: also provide the name of the token
*Input*: symbol of token as a 32-byte array (provided by **TokenManager**)
*Output*:
- address of the token
- address of the Chainlink data feed for its exchange rate with USD
- number of decimals the Chainlink data feed uses


# Stage 1 Architecture

### Contracts
The contracts used in this stage are:

- [SEuroOffering.sol](../../contracts/SEuroOffering.sol): exposes the API for obtaining sEURO by exchanging ETH or some ERC20 tokens
- [TokenManager.sol](../../contracts/TokenManager.sol): dictates which ERC20 tokens are accepted to exchange for sEURO, and stores exchange rate details
- [SEuroCalculator.sol](../../contracts/SEuroCalculator.sol): calculates how many sEURO to exchange for the given collateral
- [BondingCurve.sol](../../contracts/BondingCurve.sol): calculates the current price of sEURO in euros
- [SEuro.sol](../../contracts/SEuro.sol): the ERC20-token representing the stable euro

### Relationship
The relationship between the contracts is:
1. **SEuroOffering** gets the exchange rate contracts from **TokenManager** and uses **SEuroCalculator** to calculate the exchange rate
2. **SEuroCalculator** calculates the base exchange rate of ETH/ERC20 to euros, then gets the amount of sEURO that can be obtained with given euros
3. **BondingCurve** exposes the main APIs
