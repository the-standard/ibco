.DEFAULT_GOAL := build
.PHONY: test

build:
		@npx hardhat compile

test:
		@npx hardhat test --parallel

clean:
		@rm -rf node_modules/ && npm install

cov:
		@npx hardhat coverage

size:
		@npx hardhat size-contracts

lint:
		@npx eslint test/
