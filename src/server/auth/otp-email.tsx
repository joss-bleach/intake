// Plain-JSX react-email template — @react-email/components is deprecated on
// npm, and @react-email/render serializes ordinary React elements just fine.
// Branding matches the PWA manifest: violet-600 #7c3aed, Newsreader Display.
export function OtpEmail({ otp }: { otp: string }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>Your Intake sign-in code</title>
      </head>
      <body
        style={{
          margin: 0,
          padding: "32px 16px",
          backgroundColor: "#f5f3ff",
          fontFamily: "'Newsreader Display', Georgia, serif",
        }}
      >
        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          style={{ maxWidth: 480, margin: "0 auto" }}
        >
          <tbody>
            <tr>
              <td
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: 12,
                  padding: "32px 40px",
                  textAlign: "center",
                }}
              >
                <h1 style={{ color: "#7c3aed", fontSize: 24, margin: "0 0 16px" }}>
                  Intake
                </h1>
                <p
                  style={{
                    fontFamily: "Arial, sans-serif",
                    color: "#1f2937",
                    fontSize: 16,
                    margin: "0 0 24px",
                  }}
                >
                  Enter this code to sign in:
                </p>
                <p
                  style={{
                    fontFamily: "Arial, sans-serif",
                    fontSize: 32,
                    fontWeight: 700,
                    letterSpacing: 8,
                    color: "#1f2937",
                    margin: "0 0 24px",
                  }}
                >
                  {otp}
                </p>
                <p
                  style={{
                    fontFamily: "Arial, sans-serif",
                    color: "#6b7280",
                    fontSize: 13,
                    margin: 0,
                  }}
                >
                  This code expires in 5 minutes. If you didn't request it, you can
                  ignore this email.
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}
