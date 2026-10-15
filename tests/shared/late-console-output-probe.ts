// Imported only by late-console-output.test.ts. Like lib/env.ts when validation
// fails, it writes to the console while it evaluates.
console.warn('late-console-output-probe evaluated while the file ended');

// A module, so the test can import it dynamically.
export {};
