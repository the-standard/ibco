// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "hardhat/console.sol";

contract Staking is ERC721URIStorage, Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;

    bool public active;
    uint256 public startTime;
    uint256 public endTime;
    uint256 public initialised;
    uint256 public TOTAL_SEURO;
    uint256 public SEURO_REMAINING;
    uint public SEUROTST;
    uint public INTEREST;

    uint256 private minTST;

    address TST_ADDRESS;
    address SEURO_ADDRESS;

    mapping(address => Position) private _positions;

    struct Position {
        uint96 nonce;
        uint256 tokenId;
        bool open;
        uint256 totalValue;
        uint256 reward;
    }

    constructor(string memory _name, string memory _symbol) ERC721(_name, _symbol) {}

    function activate(
        uint256 _start,
        uint256 _end,
        address _TST_ADDRESS,
        address _SEURO_ADDRESS,
        uint256 _TOTAL_SEURO,
        uint _SEUROTST,
        uint _INTEREST
    ) external onlyOwner {

        // CHORE needs refactor
        require(active == false, 'err-already-active');
        require(initialised == 0, 'err-already-initialised');
        require(_end > _start, 'err-start-end');
        require(_end >= block.timestamp, 'err-invalid-end');

        TOTAL_SEURO = _TOTAL_SEURO;
        SEURO_REMAINING = _TOTAL_SEURO;
        SEUROTST = _SEUROTST;
        INTEREST = _INTEREST;
        TST_ADDRESS = _TST_ADDRESS;
        SEURO_ADDRESS = _SEURO_ADDRESS;
        startTime = _start;
        endTime = _end;
        initialised = block.timestamp;

        // TODO variable
        minTST = 1 ether;

        active = true;
    }

    function disable() external onlyOwner {
        require(active, 'err-not-active');
        active = false;
    }

    // reward works out the amount of seuro given to the user based on the
    // amount of TST they first put in.
    function reward(uint256 _amount) public view returns (uint256) {
        uint256 SEURO = _amount * SEUROTST / 10_000;
        uint256 REWARD = SEURO * INTEREST / 10_000;
        return REWARD + SEURO;
    }

    function mint(uint256 _amount) external returns(uint256) {

        // TODO CHORE needs refactor
        require(active == true, 'err-not-active');
        require(_amount >= minTST, 'err-not-min');
        require(block.timestamp >= startTime, 'err-not-started');
        require(block.timestamp < endTime, 'err-finished');

        // calculate the reward so we can also update the remaining SEURO
        uint256 total = reward(_amount);
        require(SEURO_REMAINING >= total, 'err-overlimit');

        // Transfer funds from sender to this contract
        // TODO send to some other guy not this contract!

        IERC20 TOKEN = IERC20(TST_ADDRESS);
        TOKEN.transferFrom(msg.sender, address(this), _amount);

        // fetch current tokenID
        uint256 newItemId = _tokenIds.current();

        Position memory position = _positions[msg.sender];

        if (position.nonce > 0) {
            position.totalValue += _amount;
            position.nonce += 1;
            position.reward += total;
        }

        if (position.nonce == 0) {
            _mint(msg.sender, newItemId);

            position.nonce = 1;
            position.open = true;
            position.totalValue = _amount;
            position.tokenId = newItemId;
            position.reward = total;

            _tokenIds.increment();
        }

        // update the position
        _positions[msg.sender] = position;

        // update the remaining SEURO
        SEURO_REMAINING -= total;

        // makes no sence to return this.
        return newItemId;
    }

    function burn() public {
        require(block.timestamp >= endTime, 'err-pool-open');

        Position memory position = _positions[msg.sender];
        require(position.nonce > 0, 'err-not-valid');
        require(position.open == true, 'err-closed');

        // update position
        position.open = false;

        // burn the token
        _burn(position.tokenId);

        // withdraw funds
        IERC20 TOKEN = IERC20(SEURO_ADDRESS);
        TOKEN.transfer(msg.sender, position.reward);
        
        _positions[msg.sender] = position;
    }

    // withdraw to the owners address
    function withdraw(address _address) external onlyOwner {
        IERC20 TOKEN = IERC20(_address);
        uint256 balance = TOKEN.balanceOf(address(this));

        require(balance > 0, 'err-no-funds');
        TOKEN.transfer(owner(), balance);
    }

    function position(address owner) external view returns (uint96, uint256, bool, uint256, uint256) {
        Position memory position = _positions[owner];
        return (
            position.nonce,
            position.tokenId,
            position.open,
            position.totalValue,
            position.reward
        );
    }

    modifier isAuthorizedForToken(uint256 tokenId) {
        require(_isApprovedOrOwner(msg.sender, tokenId), 'Not approved');
        _;
    }
}
