# Bonding Event Architecture
The bonding event is the second stage in the IBCO process and takes place after the user has obtained sEUROs through the bonding curve in Stage 1.


### Contracts
The contracts used in this stage are:

- [BondingEvent.sol](../contracts/BondingEvent.sol): exposes the bonding API and adds liquidity before bonding takes place
- [BondStorage.sol](../contracts/BondStorage.sol): contains the logic of calculating the bond reward and other relevant data
- [StandardTokenGateway.sol](../contracts/StandardTokenGateway.sol): contains the price data that determines the reward amount

### Relationship
The relationship between the contracts is:
1. **StandardTokenGateway** does not import any contract
2. **BondStorage** imports **StandardTokenGateway** to:
   * fetch the price of TST in EUR
   * get the remaining TST reward supply
   * decrease the TST reward supply
3. **BondingEvent** imports **BondStorage** to begin bonding
