//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "contracts/uniswap/INonfungiblePositionManager.sol";
import "contracts/BondStorage.sol";
import "contracts/interfaces/API.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import "@uniswap/v3-periphery/contracts/interfaces/IQuoter.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract BondingEvent is AccessControl {
    // sEUR: the main leg of the currency pair
    address public immutable SEURO_ADDRESS;
    // other: the other ERC-20 token
    address public immutable OTHER_ADDRESS;
    uint24 public immutable FEE;
    // bond storage contract
    address public bondStorageAddress;
    // controls the bonding event and manages the rates and maturities
    address public operatorAddress;
    // receives any excess USDT from the bonding event
    address public excessCollateralWallet;
    IUniswapV3Pool public pool;

    INonfungiblePositionManager private immutable manager;
    IRatioCalculator private immutable ratioCalculator;
    uint256[] private positions;
    mapping(uint256 => Position) private positionData;
    mapping(int24 => mapping(int24 => uint256)) private positionsByTick;

    // https://docs.uniswap.org/protocol/reference/core/libraries/Tick
    int24 public lowerTickDefault;
    int24 public upperTickDefault;
    int24 public tickSpacing;

    // Emitted when a user adds liquidity.
    event MintPosition(
        address user,
        uint256 nft,
        uint128 liquidity,
        uint256 amount0,
        uint256 amount1
    );

    struct Position {
        int24 lowerTick;
        int24 upperTick;
        uint128 liquidity;
    }

    // only contract owner can add the other currency leg
    bytes32 public constant WHITELIST_BONDING_EVENT =
        keccak256("WHITELIST_BONDING_EVENT");

    constructor(
        address _seuroAddress,
        address _otherAddress,
        address _manager,
        address _bondStorageAddress,
        address _operatorAddress,
        address _ratioCalculatorAddress,
        uint160 _initialPrice,
        int24 _lowerTickDefault,
        int24 _upperTickDefault,
        uint24 _fee
    ) {
        _setupRole(WHITELIST_BONDING_EVENT, msg.sender);
        SEURO_ADDRESS = _seuroAddress;
        OTHER_ADDRESS = _otherAddress;
        bondStorageAddress = _bondStorageAddress;
        operatorAddress = _operatorAddress;
        lowerTickDefault = _lowerTickDefault;
        upperTickDefault = _upperTickDefault;
        FEE = _fee;
        manager = INonfungiblePositionManager(_manager);
        ratioCalculator = IRatioCalculator(_ratioCalculatorAddress);
        initialisePool(_initialPrice, _fee);
    }

    modifier onlyPoolOwner() {
        _onlyPoolOwner();
        _;
    }

    function _onlyPoolOwner() private view {
        require(hasRole(WHITELIST_BONDING_EVENT, msg.sender), "invalid-user");
    }

    modifier onlyOperator() {
        require(msg.sender == operatorAddress, "err-not-operator");
        _;
    }

    function setStorageContract(address _newAddress) public onlyPoolOwner {
        bondStorageAddress = _newAddress;
    }

    function setOperator(address _newAddress) public onlyPoolOwner {
        operatorAddress = _newAddress;
    }

    function addExcessCollateralWallet(address _excessCollateralWallet)
        external
        onlyPoolOwner
    {
        excessCollateralWallet = _excessCollateralWallet;
    }

    function adjustTickDefaults(int24 _newLower, int24 _newHigher) external {
        _validTicks(_newLower, _newHigher);
        lowerTickDefault = _newLower;
        upperTickDefault = _newHigher;
    }

    function _validTicks(int24 newLower, int24 newHigher)
        private
        view
        onlyPoolOwner
    {
        require(
            newLower % tickSpacing == 0 && newHigher % tickSpacing == 0,
            "tick-mod-spacing-nonzero"
        );
        require(newHigher <= 887270, "tick-max-exceeded");
        require(newLower >= -887270, "tick-min-exceeded");
    }

    struct Pair {
        address token0;
        address token1;
    }

    // Compares the Standard Euro token to another token and returns them in ascending order
    function getAscendingPair() public view returns (Pair memory pair) {
        return
            SEURO_ADDRESS < OTHER_ADDRESS
                ? Pair(SEURO_ADDRESS, OTHER_ADDRESS)
                : Pair(OTHER_ADDRESS, SEURO_ADDRESS);
    }

    // Initialises a pool with another token (address) and stores it in the array of pools.
    // Note that the price is in sqrtPriceX96 format.
    function initialisePool(uint160 _price, uint24 _fee) private {
        Pair memory pair = getAscendingPair();
        address poolAddress = manager.createAndInitializePoolIfNecessary(
            pair.token0,
            pair.token1,
            _fee,
            _price
        );
        pool = IUniswapV3Pool(poolAddress);
        tickSpacing = pool.tickSpacing();
    }

    function getPositions() external view returns (uint256[] memory) {
        return positions;
    }

    function getPosition(uint256 tokenId)
        external
        view
        returns (Position memory)
    {
        return positionData[tokenId];
    }

    struct AddLiquidityParams {
        address token0;
        address token1;
        int24 lowerTick;
        int24 upperTick;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
    }

    struct AddedLiquidity {
        uint256 tokenId;
        uint128 liquidity;
        uint256 seuroAmount;
        uint256 otherAmount;
    }

    function mintLiquidityPosition(AddLiquidityParams memory params)
        private
        returns (
            AddedLiquidity memory
        )
    {
        INonfungiblePositionManager.MintParams
            memory mintParams = INonfungiblePositionManager.MintParams({
                token0: params.token0,
                token1: params.token1,
                fee: FEE,
                tickLower: params.lowerTick,
                tickUpper: params.upperTick,
                amount0Desired: params.amount0Desired,
                amount1Desired: params.amount1Desired,
                amount0Min: params.amount0Min,
                amount1Min: params.amount1Min,
                recipient: address(this),
                deadline: block.timestamp
            });

        // provide liquidity to the pool
        (
            uint256 tokenId,
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        ) = manager.mint(mintParams);

        positions.push(tokenId);
        positionData[tokenId] = Position(
            params.lowerTick,
            params.upperTick,
            liquidity
        );
        positionsByTick[params.lowerTick][params.upperTick] = tokenId;

        emit MintPosition(msg.sender, tokenId, liquidity, amount0, amount1);

        return
            params.token0 == SEURO_ADDRESS
                ? AddedLiquidity(tokenId, liquidity, amount0, amount1)
                : AddedLiquidity(tokenId, liquidity, amount1, amount0);
    }

    function increaseExistingLiquidity(AddLiquidityParams memory params, uint256 tokenId) private
        returns (
            AddedLiquidity memory
        )
    {
        INonfungiblePositionManager.IncreaseLiquidityParams
            memory increaseParams = INonfungiblePositionManager
                .IncreaseLiquidityParams({
                    tokenId: tokenId,
                    amount0Desired: params.amount0Desired,
                    amount1Desired: params.amount1Desired,
                    amount0Min: params.amount0Min,
                    amount1Min: params.amount1Min,
                    deadline: block.timestamp
                });

        (uint128 liquidity, uint256 amount0, uint256 amount1) = manager
            .increaseLiquidity(increaseParams);

        positionData[tokenId].liquidity += liquidity;

        return
            params.token0 == SEURO_ADDRESS
                ? AddedLiquidity(tokenId, liquidity, amount0, amount1)
                : AddedLiquidity(tokenId, liquidity, amount1, amount0);
    }

    function refundDifference(uint256 _addedAmount, uint256 _desiredAmount) private {
        uint256 excess = _desiredAmount - _addedAmount;
        if (excess > 0 && excessCollateralWallet != address(0)) {
            TransferHelper.safeTransfer(OTHER_ADDRESS, excessCollateralWallet, excess);
        } 
    }

    function addLiquidity(address _user, uint256 _amountSEuro)
        private
        onlyOperator
        returns (AddedLiquidity memory added)
    {
        Pair memory pair = getAscendingPair();

        (
            uint256 otherAmount,
            int24 lowerTick,
            int24 upperTick
        ) = getOtherAmount(_amountSEuro);

        (
            uint256 amount0Desired,
            uint256 amount1Desired,
            uint256 amount0Min,
            uint256 amount1Min
        ) = pair.token0 == SEURO_ADDRESS
                ? (_amountSEuro, otherAmount, _amountSEuro, uint256(0))
                : (otherAmount, _amountSEuro, uint256(0), _amountSEuro);

        // approve the position manager
        TransferHelper.safeApprove(
            pair.token0,
            address(manager),
            amount0Desired
        );
        TransferHelper.safeApprove(
            pair.token1,
            address(manager),
            amount1Desired
        );

        // send the tokens from the user to the contract
        TransferHelper.safeTransferFrom(
            pair.token0,
            _user,
            address(this),
            amount0Desired
        );
        TransferHelper.safeTransferFrom(
            pair.token1,
            _user,
            address(this),
            amount1Desired
        );

        AddLiquidityParams memory params = AddLiquidityParams(
            pair.token0,
            pair.token1,
            lowerTick,
            upperTick,
            amount0Desired,
            amount1Desired,
            amount0Min,
            amount1Min
        );

        uint256 position = positionsByTick[lowerTick][upperTick];
        added = position > 0 ?
            increaseExistingLiquidity(params, position) :
            mintLiquidityPosition(params);

        refundDifference(added.otherAmount, otherAmount);
    }

    // We assume that there is a higher layer solution which helps to fetch the latest price as a quote.
    // This quote is being used to supply the two amounts to the function.
    // The reason for this is because of the explicit discouragement of doing this on-chain
    // due to the high gas costs (see https://docs.uniswap.org/protocol/reference/periphery/lens/Quoter).
    /// @param _amountSeuro The amount of sEURO token to bond
    /// @param _maturityInWeeks The amount of weeks a bond is active.
    ///                          At the end of maturity, the principal + accrued interest is paid out all at once in TST.
    /// @param _rate The rate is represented as a 10,000-factor of each basis point so the most stable fee is 500 (= 0.05 pc)
    function _bond(
        address _user,
        uint256 _amountSeuro,
        uint256 _maturityInWeeks,
        uint256 _rate
    ) private onlyOperator {
        // information about the liquidity position after it has been successfully added
        AddedLiquidity memory added = addLiquidity(_user, _amountSeuro);
        // begin bonding event
        IBondStorage(bondStorageAddress).startBond(
            _user,
            added.seuroAmount,
            _rate,
            _maturityInWeeks,
            added.tokenId,
            added.liquidity,
            added.otherAmount
        );
    }

    // For interface purposes due to modifiers above
    function bond(
        address _user,
        uint256 _amountSeuro,
        uint256 _weeks,
        uint256 _rate
    ) external {
        _bond(_user, _amountSeuro, _weeks, _rate);
    }

    function priceWithinTickRange(
        int24 _currentPriceTick,
        int24 _lowerTick,
        int24 _upperTick
    ) private pure returns (bool) {
        return _lowerTick < _currentPriceTick && _currentPriceTick < _upperTick;
    }

    function priceHasBufferWithinTicks(
        int24 _currentPriceTick,
        int24 _lowerTick,
        int24 _upperTick
    ) private pure returns (bool) {
        // ensures that the current price sits in middle 20% of difference between the two range ticks, which keeps the ratio required pretty respectable
        int24 lowerToPriceDiff = _currentPriceTick - _lowerTick;
        int24 priceToUpperDiff = _upperTick - _currentPriceTick;
        return
            ((lowerToPriceDiff * 3) / 2 > priceToUpperDiff) &&
            ((priceToUpperDiff * 3) / 2 > lowerToPriceDiff);
    }

    function viableTickPriceRatio(
        uint160 _price,
        int24 _lowerTick,
        int24 _upperTick
    ) private view returns (bool) {
        int24 currentPriceTick = ratioCalculator.getTickAt(_price);
        return
            priceWithinTickRange(currentPriceTick, _lowerTick, _upperTick) &&
            priceHasBufferWithinTicks(currentPriceTick, _lowerTick, _upperTick);
    }

    function getOtherAmount(uint256 _amountSEuro)
        public
        view
        returns (
            uint256 amountOther,
            int24 lowerTick,
            int24 upperTick
        )
    {
        (uint160 price, , , , , , ) = pool.slot0();
        Pair memory pair = getAscendingPair();
        bool seuroIsToken0 = pair.token0 == SEURO_ADDRESS;
        lowerTick = lowerTickDefault;
        upperTick = upperTickDefault;
        int24 magnitude = 1000;
        // expand tick range by 1000 ticks until a viable ratio is found
        while (!viableTickPriceRatio(price, lowerTick, upperTick)) {
            lowerTick -= magnitude;
            upperTick += magnitude;
        }

        amountOther =
            (ratioCalculator.getRatioForSEuro(
                _amountSEuro,
                price,
                lowerTick,
                upperTick,
                seuroIsToken0
            ) * 10001) /
            // may need to add a very small amount to usdt due to an accuracy error (0.01%). it also protects against some slippage. being sent to a wallet anyway
            10000;
    }
}
