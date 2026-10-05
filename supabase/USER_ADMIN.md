# Gebruikersbeheer installeren

Het beheervenster is `admin-users.html`. Alleen een ingelogde admin ziet de
knop **Gebruikers beheren** en mag de Supabase-functie aanroepen. Het e-mailadres
is de inlognaam. Gebruikers kiezen zelf hun wachtwoord via een Supabase-mail.

## Installatie in het bestaande Supabase-project

1. Voer `migrations/202610050004_user_admin.sql` volledig uit in de SQL Editor.
   Deze migratie behoudt bestaande rollen, maakt nieuwe profielen als viewer en
   beschermt rolwijzigingen. Controleer eventuele bestaande `profiles`-triggers
   en constraints als je schema aanvullende verplichte velden heeft.
2. Deploy de functie:

   ```sh
   supabase login
   supabase functions deploy user-admin --project-ref zrcdyzcfsdlmqqwdhctk
   ```

   De functie gebruikt de ingebouwde servervariabelen `SUPABASE_URL`,
   `SUPABASE_ANON_KEY` en `SUPABASE_SERVICE_ROLE_KEY`. Plaats de service-role key
   nooit in HTML, JavaScript voor de browser of een publiek configuratiebestand.
3. Zet bij **Authentication > URL Configuration** de Site URL op
   `https://tastenbraille.com/mpop/index.html`. Voeg deze Redirect URLs toe:

   - `https://tastenbraille.com/mpop/index.html`
   - `https://tastenbraille.com/mpop/reset-password.html`
   - De overeenkomstige `https://www.tastenbraille.com/mpop/`-URL's als je die host gebruikt.

   De mailfunctie stuurt standaard naar de reset-password-pagina op de host zonder
   `www`. Voor een andere installatie kun je de serversecret
   `MPOP_AUTH_REDIRECT_URL` instellen. De browser kan die URL niet wijzigen.
4. Configureer SMTP onder **Authentication > Email / SMTP** voor uitnodigingen
   en herstelmails naar echte gebruikers. Supabase's standaard maildienst heeft
   beperkte ontvangers en verzendlimieten. Houd de Invite user- en Reset
   password-templates op een link met `{{ .ConfirmationURL }}`. Een aangepaste
   template met `token_hash` en `type=invite` of `type=recovery` wordt ook ondersteund.
5. Publiceer `index.html`, `admin-users.html`, `admin-users.js`,
   `reset-password.html`, `auth-password.js`, `password-link.js` en `manual.pdf`.
   Publiceer ook `supabase-client.js`. Dit bestand bevat dezelfde publieke
   configuratiefallback als de editor. Het optionele `supabase-config.js` kan
   daardoor ontbreken; een eventuele lokale projectconfiguratie heeft voorrang.

## Gebruik door de admin

1. Log in als admin en klik op **Gebruikers beheren**. Er opent een apart venster.
2. Vul de naam, het e-mailadres en de rol in en klik **Uitnodiging versturen**.
3. De ontvanger opent de Supabase-mail en stelt een wachtwoord in. Daarna logt
   de gebruiker in met het e-mailadres en dat wachtwoord.
4. Voor bestaande accounts: kies de rol en klik **Rol opslaan**. Laat de gebruiker
   opnieuw inloggen om de gewijzigde knoppen te zien.
5. Wachtwoord vergeten: klik naast de juiste gebruiker **Herstelmail versturen**.
   De ontvanger opent de nieuwste link en stelt een nieuw wachtwoord in.

De admin ziet geen wachtwoorden en verstuurt geen wachtwoorden in de mail.
Zelfregistratie blijft beschikbaar; nieuwe gebruikers starten als viewer.
De admin kan zijn eigen rol niet verwijderen. De database voorkomt ook dat
gelijktijdige verzoeken de laatste admin verwijderen.

Een verlopen uitnodiging kun je opnieuw via een uitnodiging proberen te sturen;
bij een bestaand account gebruik je **Herstelmail versturen**. Als een uitnodiging
is verstuurd maar de roltoekenning mislukt, blijft het profiel bij normale
installatie viewer: sla de gewenste rol opnieuw op in de lijst.

## Controle

```sh
node --test tools/user-admin.test.mjs
php tools/build-manual.php
```

Voer na installatie een live test uit met een gecontroleerd testadres: uitnodigen,
wachtwoord instellen, inloggen, herstelmail en opnieuw inloggen. Controleer ook
dat een viewer of editor geen toegang heeft tot de functie. De lokale tests
versturen geen echte mails en wijzigen geen echte accounts.

Bronnen: [Supabase invitations](https://supabase.com/docs/guides/auth/users#inviting-users),
[wachtwoordherstel](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail),
[SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
