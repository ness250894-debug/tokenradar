import { Config } from "@remotion/cli/config";

const configuredConcurrency = process.env.REMOTION_CONCURRENCY?.trim();

Config.setVideoImageFormat("png");
Config.setOverwriteOutput(true);
Config.setConcurrency(configuredConcurrency || null); // Default: half of CPU threads; override with REMOTION_CONCURRENCY.
Config.setX264Preset("medium");
Config.setPublicDir("public/video-assets");
Config.setChromiumDisableWebSecurity(true); // Useful if we need to load external images (like token og images)
