const dotenv = require("dotenv");

dotenv.config({ path: ".env.test", override: true, quiet: true });
dotenv.config({ path: ".env", quiet: true });

process.env.NODE_ENV = "test";