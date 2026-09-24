const dotenv = require("dotenv");

// Test-specific configuration only; never fall back to a development database.
dotenv.config({ path: ".env.test", override: false, quiet: true });

process.env.NODE_ENV = "test";
