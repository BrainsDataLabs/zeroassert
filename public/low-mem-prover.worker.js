importScripts('https://unpkg.com/snarkjs@0.7.3/build/snarkjs.min.js');

self.onmessage = async (event) => {
  const { input, wasmUrl, zkeyUrl } = event.data;

  try {
    self.postMessage({ status: 'generating_proof' });

    // CRITICAL MEMORY OPTIMIZATION: 
    // Passing URLs instead of ArrayBuffers forces snarkjs to stream the zkey in chunks,
    // bypassing the double-allocation OOM crash on Android.
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      wasmUrl,
      zkeyUrl
    );

    self.postMessage({
      status: 'success',
      proof,
      publicSignals,
    });
  } catch (error) {
    self.postMessage({
      status: 'error',
      error: error.message || 'WASM calculation failed',
    });
  }
};

