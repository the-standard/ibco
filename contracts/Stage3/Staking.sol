// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "contracts/Stage2/StandardTokenGateway.sol";
import "contracts/Pausable.sol";
import "contracts/SimpleInterest.sol";

contract Staking is ERC721, Ownable, Pausable {
    uint256 private _tokenId;

    // Standard Token data feed
    StandardTokenGateway public tokenGateway;

    bool public active;             // active or not, needs to be set manually
    bool public isCatastrophy;       // in the event of a catastrophy, let users withdraw

    uint256 public windowStart;         // the start time for the 'stake'
    uint256 public windowEnd;           // the end time for the 'stake'
    uint256 public maturity;            // the maturity date
    uint256 public initialisedAt;       // the time of contract initialisation (epoch time)
    uint256 public allocatedSeuro;      // the amount of seuro allocated, inc rewards

    address public immutable TST_ADDRESS;
    address public immutable SEURO_ADDRESS;
    uint256 private immutable RATE_FACTOR = 10 ** 5;
    uint256 public immutable SI_RATE; // simple interest rate for the bond (factor of 10 ** 5)
    uint256 public immutable minTST;  // the allowed minimum amount of TST to bond

    mapping(address => Position) private _positions;

    struct Position {
        uint96 nonce;
        uint256 tokenId;
        bool open;
        uint256 stake;
        uint256 reward;
    }

    constructor(
        string memory _name,
        string memory _symbol,
        address _gatewayAddress,
        uint256 _start,
        uint256 _end,
        uint256 _maturity,
        address _standardAddress,
        address _seuroAddress,
        uint256 _si
    ) ERC721(_name, _symbol) {
        tokenGateway = StandardTokenGateway(_gatewayAddress);
        (uint256 tokenPrice,) = tokenGateway.getSeuroStandardTokenPrice();
        require(tokenPrice > 0, "err-zero-tst-price");

        SI_RATE = _si;
        TST_ADDRESS = _standardAddress;
        SEURO_ADDRESS = _seuroAddress;
        windowStart = _start;
        windowEnd = _end;
        maturity = _maturity;
        initialisedAt = block.timestamp;
        minTST = 1 ether;
    }

    function activate() external onlyOwner {
        require(active == false, "err-already-active");
        active = true;
    }

    function disable() external onlyOwner {
        require(active, "err-not-active");
        active = false;
    }

    // calculates the reward in SEURO based in the input of amount of TSTs
    function calculateReward(uint256 _amountStandard) public view returns (uint256 reward) {
        (uint256 tokenPrice, bool inverted) = tokenGateway.getSeuroStandardTokenPrice();
        return (SimpleInterest.convert(_amountStandard, tokenPrice, inverted) * SI_RATE) / RATE_FACTOR;
    }

    // fetches the balance of the contract for the give erc20 token
    function balance(address _address) public view returns (uint256) {
        IERC20 TOKEN = IERC20(_address);
        return TOKEN.balanceOf(address(this));
    }

    // fetches the remaining about of tokens in the contract
    function remaining(address _address) public view returns (uint256) {
        return balance(_address) - allocatedSeuro;
    }

    // Main API to begin staking
    function startStake(uint256 _amountStandard) external ifNotPaused {
        require(active == true, "err-not-active");
        require(_amountStandard >= minTST, "err-not-min");
        require(block.timestamp >= windowStart, "err-not-started");
        require(block.timestamp < windowEnd, "err-finished");

        // calculate the reward so we can also update the remaining SEURO
        uint256 reward = calculateReward(_amountStandard);
        require(remaining(SEURO_ADDRESS) >= reward, "err-overlimit");

        // Transfer funds from sender to this contract
        // TODO send to some other guy not this contract!

        IERC20 TOKEN = IERC20(TST_ADDRESS);
        TOKEN.transferFrom(msg.sender, address(this), _amountStandard);

        // fetch current tokenID
        uint256 newItemId = _tokenId;

        Position memory pos = _positions[msg.sender];

        if (pos.nonce == 0) {
            _mint(msg.sender, newItemId);

            pos.open = true;
            pos.tokenId = newItemId;

            _tokenId++;
        }

        // update the position
        pos.stake += _amountStandard;
        pos.nonce += 1;
        pos.reward += reward;

        // update the position
        _positions[msg.sender] = pos;

        // update the rewards in SEUR to be paid out
        allocatedSeuro += reward;
    }

    function claimReward() public ifNotPaused {
        require(block.timestamp >= maturity, "err-maturity");

        Position memory pos = _positions[msg.sender];
        require(pos.nonce > 0, "err-not-valid");
        require(pos.open == true, "err-closed");

        // update position
        pos.open = false;

        // burn the token
        _burn(pos.tokenId);

        // transfer stake
        IERC20 TST = IERC20(TST_ADDRESS);
        TST.transfer(msg.sender, pos.stake);

        // transfer reward
        IERC20 SEURO = IERC20(SEURO_ADDRESS);
        SEURO.transfer(msg.sender, pos.reward);

        _positions[msg.sender] = pos;
    }

    // withdraw to the owner's address
    function withdraw(address _address) external onlyOwner {
        IERC20 TOKEN = IERC20(_address);
        uint256 bal = TOKEN.balanceOf(address(this));

        require(bal > 0, "err-no-funds");
        TOKEN.transfer(owner(), bal);
    }

    function position(address owner) external view returns (Position memory) {
        return _positions[owner];
    }

    function enableCatastrophy() external onlyOwner {
        require(active == true, "err-already-active");
        require(isCatastrophy == false, "err-already-isCatastrophy");
        isCatastrophy = true;
        active = false;
    }

    function disableCatastrophy() external onlyOwner {
        require(isCatastrophy == true, "err-not-allowed");

        Position memory pos = _positions[msg.sender];
        require(pos.nonce > 0, "err-no-position");
        require(pos.open == true, "err-postition-closed");

        IERC20 TOKEN = IERC20(TST_ADDRESS);
        TOKEN.transfer(msg.sender, pos.stake);

        // closed for business
        pos.open = false;

        // burn the token
        _burn(pos.tokenId);

        _positions[msg.sender] = pos;
    }
}
