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

import "hardhat/console.sol";

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
    IUniswapV3Pool public pool;

    INonfungiblePositionManager private immutable manager;
    IRatioCalculator private immutable ratioCalculator;
    uint256[] private positions;
    mapping(uint256 => Position) private positionData;

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

    // Compares the Standard Euro token to another token and returns them in ascending order
    function getAscendingPair()
        public
        view
        returns (address token0, address token1)
    {
        (token0, token1) = SEURO_ADDRESS < OTHER_ADDRESS
            ? (SEURO_ADDRESS, OTHER_ADDRESS)
            : (OTHER_ADDRESS, SEURO_ADDRESS);
    }

    // Initialises a pool with another token (address) and stores it in the array of pools.
    // Note that the price is in sqrtPriceX96 format.
    function initialisePool(uint160 _price, uint24 _fee) private {
        (address token0, address token1) = getAscendingPair();
        address poolAddress = manager.createAndInitializePoolIfNecessary(
            token0,
            token1,
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

    struct LiquidityPair {
        address user;
        uint256 amountSeuro;
        uint256 amountOther;
    }

    struct AddLiquidityParams {
        address token0;
        address token1;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
    }

    function mintLiquidityPosition(AddLiquidityParams memory params) private returns (
            uint256,
            uint128,
            uint256,
            uint256
        ) {
        INonfungiblePositionManager.MintParams
            memory mintParams = INonfungiblePositionManager.MintParams({
                token0: params.token0,
                token1: params.token1,
                fee: FEE,
                tickLower: lowerTickDefault,
                tickUpper: upperTickDefault,
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
            lowerTickDefault,
            upperTickDefault,
            liquidity
        );

        emit MintPosition(msg.sender, tokenId, liquidity, amount0, amount1);

        return
            params.token0 == SEURO_ADDRESS
                ? (tokenId, liquidity, amount0, amount1)
                : (tokenId, liquidity, amount1, amount0);
    }
    
    function increaseExistingLiquidity(AddLiquidityParams memory params, uint256 tokenId) private returns (
            uint256,
            uint128,
            uint256,
            uint256
        ) {
        INonfungiblePositionManager.IncreaseLiquidityParams memory
            increaseParams = INonfungiblePositionManager.IncreaseLiquidityParams({
            tokenId: tokenId,
            amount0Desired: params.amount0Desired,
            amount1Desired: params.amount1Desired,
            amount0Min: params.amount0Min,
            amount1Min: params.amount1Min,
            deadline: block.timestamp
        });

        (
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        ) = manager.increaseLiquidity(increaseParams);
        
        positionData[tokenId].liquidity += liquidity;

        return
            params.token0 == SEURO_ADDRESS
                ? (tokenId, liquidity, amount0, amount1)
                : (tokenId, liquidity, amount1, amount0);
    }

    function addLiquidity(LiquidityPair memory lp)
        private
        onlyOperator
        returns (
            uint256,
            uint128,
            uint256,
            uint256
        )
    {
        (address token0, address token1) = getAscendingPair();

        (
            uint256 amount0Desired,
            uint256 amount1Desired,
            uint256 amount0Min,
            uint256 amount1Min
        ) = token0 == SEURO_ADDRESS
                ? (lp.amountSeuro, lp.amountOther, lp.amountSeuro, uint256(0))
                : (lp.amountOther, lp.amountSeuro, uint256(0), lp.amountSeuro);

        // approve the position manager
        TransferHelper.safeApprove(token0, address(manager), amount0Desired);
        TransferHelper.safeApprove(token1, address(manager), amount1Desired);

        // send the tokens from the user to the contract
        TransferHelper.safeTransferFrom(
            token0,
            lp.user,
            address(this),
            amount0Desired
        );
        TransferHelper.safeTransferFrom(
            token1,
            lp.user,
            address(this),
            amount1Desired
        );
        
        AddLiquidityParams memory params = AddLiquidityParams(
            token0,
            token1,
            amount0Desired,
            amount1Desired,
            amount0Min,
            amount1Min
        );

        if (positions.length > 0) {
            return increaseExistingLiquidity(params, positions[0]);
        } else {
            return mintLiquidityPosition(params);
        }
    }

    // We assume that there is a higher layer solution which helps to fetch the latest price as a quote.
    // This quote is being used to supply the two amounts to the function.
    // The reason for this is because of the explicit discouragement of doing this on-chain
    // due to the high gas costs (see https://docs.uniswap.org/protocol/reference/periphery/lens/Quoter).
    /// @param _amountSeuro The amount of sEURO token to bond
    /// @param _amountOther The amount of the other token to bond
    /// @param _maturityInWeeks The amount of weeks a bond is active.
    ///                          At the end of maturity, the principal + accrued interest is paid out all at once in TST.
    /// @param _rate The rate is represented as a 10,000-factor of each basis point so the most stable fee is 500 (= 0.05 pc)
    function _bond(
        address _user,
        uint256 _amountSeuro,
        uint256 _amountOther,
        uint256 _maturityInWeeks,
        uint256 _rate
    ) private onlyOperator {
        LiquidityPair memory lp = LiquidityPair(
            _user,
            _amountSeuro,
            _amountOther
        );
        // information about the liquidity position after it has been successfully added
        (
            uint256 tokenId,
            uint128 liquidity,
            uint256 amountSeuro,
            uint256 amountOther
        ) = addLiquidity(lp);
        // begin bonding event
        IBondStorage(bondStorageAddress).startBond(
            _user,
            amountSeuro,
            _rate,
            _maturityInWeeks,
            tokenId,
            liquidity,
            amountOther
        );
    }

    // For interface purposes due to modifiers above
    function bond(
        address _user,
        uint256 _amountSeuro,
        uint256 _amountOther,
        uint256 _weeks,
        uint256 _rate
    ) external {
        _bond(_user, _amountSeuro, _amountOther, _weeks, _rate);
    }

    function getOtherAmount(uint256 _amountSEuro)
        external
        view
        returns (uint256)
    {
        (uint160 price, , , , , , ) = pool.slot0();
        (address token0, ) = getAscendingPair();
        bool seuroIsToken0 = token0 == SEURO_ADDRESS;
        return
            ratioCalculator.getRatioForSEuro(
                _amountSEuro,
                price,
                lowerTickDefault,
                upperTickDefault,
                seuroIsToken0
            );
    }
}
