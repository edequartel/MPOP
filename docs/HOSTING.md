# Hosting on tastenbraille.com

The application runs on Apache/PHP at `https://tastenbraille.com/mpop/`.
Vercel and Node serverless handlers are not required.

## Services

- HTML, JavaScript, CSS and `manual.pdf`: your own web server.
- PDF generation: `api/pdf.php`, `api/manualpdf.php`, `api/pdfbraille.php`
  and `api/wordgrouppdf.php`, using Dompdf.
- Audio generation, uploads and merging: the existing PHP endpoints; the
  server needs cURL and FFmpeg plus its private ElevenLabs configuration.
- Authentication and data: Supabase.
- User invitations, roles and reset emails: the Supabase Edge Function
  `user-admin`. This function is independent of Vercel and must be deployed to
  Supabase. See [installation instructions](../supabase/USER_ADMIN.md).

## Publish an update

1. Publish the website files, including `supabase-client.js`, `.htaccess`, the
   `api/` PHP files and `manual.pdf`, under the server's `/mpop/` directory.
2. Remove these obsolete Node handlers from the deployed server if they still
   exist: `api/pdf.js`, `api/manualpdf.js`, `api/pdfbraille.js` and
   `api/supabase-config.js`. Their PHP replacements are already in the project.
3. Install PHP dependencies using `composer install --no-dev`, or include the
   installed `vendor/` directory in the deployment.
4. Retain the existing private ElevenLabs and FFmpeg configuration. Never
   publish the ElevenLabs API key or a Supabase service-role key in web files.
5. Install the user-admin SQL migration and deploy the Supabase function as
   described in `supabase/USER_ADMIN.md`. Configure Supabase SMTP and allowed
   redirect URLs for account emails.

The optional local `supabase-config.js` may override the public project settings.
If it is absent, the pages use the public fallback; they do not fetch config from
a remote serverless application.

Apache's `.htaccess` keeps the previous extensionless PDF and public config routes
working. Current frontend code uses `.php` endpoints explicitly. The built-in PHP
development server does not apply `.htaccess`, so use the explicit `.php` paths
when testing locally.
