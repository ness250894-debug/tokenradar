import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setConcurrency(1); // Optional, limits concurrent renders
Config.setChromiumDisableWebSecurity(true); // Useful if we need to load external images (like token og images)
