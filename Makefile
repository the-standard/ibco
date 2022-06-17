.DEFAULT_GOAL := build
.PHONY: test

build:
		@npx hardhat compile

test:
		@npx hardhat test

clean:
		@rm -rf node_modules/ && npm install
