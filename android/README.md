# Traces of Pain kiosk app (Android)

An Android app for the venue tablets. It shows the guide full screen, works without internet,
updates itself from GitHub Pages when it is online, and keeps visitors inside the guide.

**Download the APK:**
https://github.com/filipmmasek/traces-of-pain-guide/releases/download/kiosk-app/traces-of-pain-kiosk.apk

Every push to `main` builds a new APK with the latest website inside (GitHub Actions,
workflow "Android kiosk app"), and replaces the file at that link.

## What it does

- **Offline:** the whole website (texts, photos, Czech fonts) is inside the app. The Adobe fonts
  are saved the first time the tablet is online.
- **Updates:** every 15 minutes, and whenever Wi-Fi comes back, the app asks GitHub what changed on
  `main` and downloads only the changed files from https://filipmmasek.github.io/traces-of-pain-guide/
  (tracesofpain.com is never used, because the venue blocks it). Each file is checked against GitHub.
  The new version is switched on only when every file has arrived, and the screen reloads after
  2 minutes without touches (or at once when staff close the menu), so nobody sees a half-updated
  page. A file that GitHub Pages still does not have 20 minutes after a change is skipped instead of
  holding back the update. If api.github.com is blocked, a
  quick update still fetches the texts, code and new photos straight from GitHub Pages.
- **Kiosk:** full screen, Back stays inside the guide, links to other sites are blocked, the screen
  stays on, and the app starts by itself when the tablet is switched on. The site's own kiosk mode
  is on (no QR code for the tablet itself, back to the start page after 90 s).
- **Staff menu:** tap the **top-left corner 5 times** quickly, then enter the PIN
  (**1234** at first, change it). From there: update now, reload, set the start page and language,
  change the PIN, undo downloaded updates, exit the kiosk, and release the tablet after the exhibition.

## Setting up a tablet

Connect the tablet to Wi-Fi before you start, so the app can load the fonts and the newest version.

### Option A: full lock (recommended, needs a computer and a USB cable once)

The app becomes the tablet's "device owner", so Android itself blocks Home, Recents, notifications
and the status bar. Only the PIN gets out.

1. On the tablet, remove all accounts (Google and Samsung): Settings > Accounts and backup >
   Manage accounts. Android only allows a device owner on a tablet with no accounts. You can add
   them back afterwards.
2. Turn on USB debugging: Settings > About tablet > Software information > tap **Build number**
   7 times. Then Settings > Developer options > **USB debugging** on.
3. On the computer, install Android platform tools (`adb`):
   https://developer.android.com/tools/releases/platform-tools
4. Download the APK to the computer, connect the tablet by USB, allow the prompt on the tablet, and run:
   ```
   adb install -r traces-of-pain-kiosk.apk
   adb shell dpm set-device-owner com.tracesofpain.kiosk/.AdminReceiver
   adb shell am start -n com.tracesofpain.kiosk/.MainActivity
   ```
   The second command should answer `Success: Device owner set to package ...`.
5. The guide opens and locks. Open the staff menu, change the PIN, choose the start language, and
   if the tablet stands in front of one photo, go to that project page and tap
   **Use the page shown now as start page**.
6. Turn USB debugging off again (exit the kiosk from the staff menu to reach Settings, then open the
   guide again to lock it).

### Option B: no computer (screen pinning)

Weaker: Android's screen pinning, which a visitor can undo by holding Back and Recents together,
but then they land on the tablet's lock screen, so set a screen lock PIN on the tablet.

1. Set a screen lock PIN: Settings > Lock screen > Screen lock type > PIN.
2. Turn on pinning: Settings > Security and privacy > More security settings > **Pin windows**
   (on, with "Ask for PIN before unpinning").
3. Open the download link above in the tablet's browser, install the APK (allow installing from
   the browser when asked).
4. Settings > Apps > Choose default apps > **Home app** > Traces of Pain, so the tablet opens the
   guide after a restart.
5. Open the guide and confirm **Pin**. Then set PIN, language and start page as in A5.

## Updating the app itself

Website changes arrive by themselves. Only a new version of the app needs installing: for a
device-owner tablet run `adb install -r traces-of-pain-kiosk.apk` again (settings and lock stay);
otherwise exit the kiosk and install the new APK from the browser.

## After the exhibition

Staff menu > **Release tablet after the exhibition**, then uninstall the app normally.

## For developers

- Code: `android/app/src/main/java/com/tracesofpain/kiosk/`. Plain Java, no libraries.
- The site is served inside the app from its real GitHub Pages address, so local storage, the
  password (passed as `?k=pain`) and the Adobe Fonts domain check behave as on the website.
- `android/bundle_site.py` copies the site into `assets/site/` with a manifest of git blob ids;
  `SiteStore.included()` must exclude the same files.
- Signing: the workflow signs with the key in the repository secrets `KIOSK_KEYSTORE` (base64 of a
  PKCS12 keystore, alias `kiosk`) and `KIOSK_KEYSTORE_PASSWORD`. The same key on every build lets a
  new APK install over the old one (keeping the device-owner lock). Never commit the key to this
  public repo. Without the secrets the APK is signed with a throwaway key.
- Build locally: `python3 android/bundle_site.py && gradle -p android assembleRelease`
  (needs the Android SDK).
