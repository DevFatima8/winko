/** @type {import('next').NextConfig} */
const nextConfig = {
    // Bundles a self-contained server + node_modules (mysql2 included) so Hostinger
    // doesn't need to run npm install and can't lose native/production dependencies.
    output: "standalone",
    // mysql2 is loaded via a dynamic Function()-based import (to keep it out of the
    // client bundle), which hides it from Next's file tracer — force-include it here
    // so the standalone build actually ships the driver.
    outputFileTracingIncludes: {
        "/**/*": ["./node_modules/mysql2/**/*"],
    },
};

export default nextConfig;
