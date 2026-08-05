# Connect Your Discord Account

## Why this matters

Authorize Discord securely, join the private server, receive the premium role, and solve common connection problems.

## Clear explanation

The private community is a study room, not a signal room. Use it to improve your thinking without giving away your responsibility.

The Academy can link your paid Ronin Charts account to Discord. After you approve the connection, the server can add you to the private Discord and assign the premium role.

The connection uses Discord’s standard authorization flow. Your Discord password is never entered on Ronin Charts and is never visible to the site.

### Connect in the Academy

1. Open the **Discord Community** tab at the top of the Academy.
2. Select **Connect Discord**.
3. Log in on Discord if requested.
4. Approve the `identify` and `guilds.join` permissions.
5. Return to Ronin Charts automatically.
6. Complete Discord membership screening if the server requires it.
7. Confirm that the **Ronin Premium** role appears.

[Open the Discord Community tab](/academy.html?tab=discord)

### What the permissions mean

- `identify` lets the site read the basic Discord account ID and username needed to link the correct account
- `guilds.join` lets the Ronin Charts application add the authorized user to the configured private server

The application does not request access to read your private messages.

### If the connection fails

### “Discord is not configured”

The site owner has not yet added the Discord application, bot token, server ID, and premium role ID to the server environment.

### “You are already connected”

Use **Sync Premium Role**. This checks the stored Discord account and reapplies the configured premium role if the member is still inside the server.

### You joined but cannot see the channels

Complete the server’s membership screening and check that the premium role was assigned. Then refresh Discord.

### You left the server

Reconnect Discord. Joining a user who has left requires a new user authorization.

### Wrong Discord account

Use **Disconnect**, log out of Discord in the browser if necessary, and connect again with the correct account.

### Privacy and security

The reference implementation stores the Discord user ID, display name, connection time, server ID, and premium-role status. It does not need to retain the short-lived user access token after the member is added.

## Real example or short trading story

You select **Connect Discord** inside the Academy, authorize the requested identity and server-join permissions, and return to Ronin Charts.

The system links one Discord identity to one premium account, adds the member to the configured server, and assigns the premium role. It never asks for your Discord password.

If screening or role assignment is incomplete, you use the sync and troubleshooting steps instead of creating duplicate accounts.

## Key rules / steps

1. **Open the Discord Community tab and select Connect Discord.**
2. **Authorize only the documented `identify` and `guilds.join` permissions.**
3. **Complete membership screening and confirm the Ronin Premium role.**
4. **Use Sync Premium Role or the documented recovery steps if access is incomplete.**
5. **Never share passwords, bot tokens, client secrets, or private account data.**

**Rule to remember**

> Community access is a benefit of premium membership, but responsibility for every trading decision remains with the member.

## Common mistakes

- Sharing passwords or secret credentials
- Connecting multiple accounts to bypass the one-identity rule
- Ignoring membership screening or role-sync instructions

### Coach's note

Watch for **social proof and herd behavior**. Community can improve learning or weaken independence. Write your own plan before reading other opinions.

## Practice / Reflection question

### Practice

Use the Academy Discord tab to complete the connection flow in a test or staging account. Confirm that the correct server and premium role appear.

Then test the documented recovery path for pending screening or a missing role. Never place live bot tokens or client secrets in browser code or screenshots.

### Reflection

1. How will you use the community without giving away your decision-making responsibility?
2. What would a high-quality process question look like for this lesson?
3. What personal plan must exist before you read another member’s opinion?

### Before you mark this lesson complete

- [ ] I can explain the rule in my own words
- [ ] I can identify valid and rejected examples without seeing the future candles
- [ ] I can name the psychological pressure that threatens this rule
- [ ] I can apply the rule inside the complete Ronin process
