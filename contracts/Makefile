.PHONY: all build clean check clippy fmt

WASM_TARGET := wasm32-unknown-unknown

all: build

prepare:
	rustup target add $(WASM_TARGET)

build:
	cargo build --release --target $(WASM_TARGET)
	@echo "WASM files generated in target/$(WASM_TARGET)/release/"

check:
	cargo check --target $(WASM_TARGET)

clippy:
	cargo clippy --target $(WASM_TARGET) -- -D warnings

fmt:
	cargo fmt

fmt-check:
	cargo fmt -- --check

clean:
	cargo clean

copy-wasm:
	mkdir -p wasm
	cp target/$(WASM_TARGET)/release/recovery_registry.wasm wasm/
	cp target/$(WASM_TARGET)/release/add_associated_key.wasm wasm/
	cp target/$(WASM_TARGET)/release/remove_associated_key.wasm wasm/
	cp target/$(WASM_TARGET)/release/update_thresholds.wasm wasm/
	cp target/$(WASM_TARGET)/release/update_associated_keys.wasm wasm/
	@echo "WASM files copied to wasm/"
