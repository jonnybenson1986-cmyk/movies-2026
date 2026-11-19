# CarPlay native integration (requires Apple approval)

The mobile starter does not claim CarPlay is enabled. Request the CarPlay Audio entitlement from Apple for the production Bundle ID first. After approval, configure the matching App ID, provisioning profile and signed entitlement `com.apple.developer.carplay-audio`.

Then add a `CPTemplateApplicationScene` configuration and scene delegate to the generated iOS target. Build a `CPTabBarTemplate` containing `CPListTemplate` tabs for For You and Saved Playlists, and route the Now Playing template's transport controls to the authorized Track Player queue. Use Apple's current CarPlay Audio app programming guide and review requirements. YouTube embedded playback must not be exposed as background CarPlay audio.

Because Expo prebuild regenerates native projects, put the final Swift scene delegate and Info.plist scene manifest into a maintained config plugin or a checked-in native iOS project after running prebuild. Do not add an unapproved entitlement and assume it will work.
