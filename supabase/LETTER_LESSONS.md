# Letterlessen installeren

1. Open je Supabase-project en ga naar **SQL Editor > New query**.
2. Voer de volledige inhoud van `migrations/202610050001_letter_lessons.sql` eenmalig uit.
3. Push de websitewijzigingen en pull ze op de server. Ververs daarna de browser.

De migratie voegt velden en twee functies toe aan de bestaande database. Bestaande items blijven woorden; er worden geen letterlessen automatisch aangemaakt. Het type van `parent_item_id` wordt afgeleid van het bestaande `mpop_items.id`.

De bestaande lees- en wijzigingsrechten blijven gelden. De nieuwe functies gebruiken die rechten ook. Admins en editors kunnen letterlessen toevoegen en verplaatsen; viewers en soundcreators kunnen de lessen alleen bekijken. Controleer dat de bestaande update-policy van `mpop_items` admins en editors toestaat en de profile-policy de eigen rol laat lezen.

Klik op **+** naast een woord, vul een letter of combinatie zoals `aa` in en klik op **Toevoegen**. De nieuwe les verschijnt onder het woord. Gebruik de pijlen om de volgorde te veranderen. Letters hoeven niet overeen te komen met de spelling van het woord; dezelfde combinatie mag vaker voorkomen.

Elke letterles heeft Blok, Week, Les, Doel en alle onderdelen uit het lesformulier, met een instructie- en materiaalveld per onderdeel. Wijzigingen worden automatisch opgeslagen; **Opslaan** slaat direct op. **Opnieuw laden** haalt de opgeslagen versie op.

## Standaardinhoud voor nieuwe lessen

Voer ook `migrations/202610050002_letter_lesson_defaults.sql` uit in de Supabase SQL Editor. De oorspronkelijke migratie hoeft niet opnieuw uitgevoerd te worden.

De letterles met de naam **default** onder de eerste woordgroep in de lijst (bijvoorbeeld **woord**) is het sjabloon. Vul daar de gewenste standaardwaarden in en sla ze op. Nieuwe letterlessen krijgen een eigen kopie van Blok, Week, Les, Doel en alle instructie- en materiaalvelden. De gekozen letter blijft de letter die je met **+** invoert. Latere wijzigingen in het sjabloon wijzigen geen bestaande lessen. Zonder dit sjabloon wordt een lege les aangemaakt.

De letterknoppen tonen bijvoorbeeld **b1,w2,l3 b**. Voor niet ingevulde nummers verschijnt **-**.

## Letterlessen verwijderen

Voer `migrations/202610050003_delete_letter_lessons.sql` uit in de Supabase SQL Editor. Admins en editors zien daarna **×** naast de pijlen van elke letterles. Bevestig het verwijderen in het dialoogvenster. Na het verwijderen van de geopende les wordt het woord geopend. De andere lessen en de inhoud van Multimodaal en Leesboek blijven behouden.

De lesgegevens staan in `mpop_items.lesson_plan` als JSON. Letterlessen gebruiken hun eigen lesformulier; de bestaande woordeditor, audio en braillepagina's blijven voor woorditems beschikbaar.

Controleer na installatie: maak bij `aap` eerst `p` en dan `aa`, verplaats `aa` omhoog, vul een instructie en materiaal in en ververs de pagina. Controleer ook met een viewer dat de les zichtbaar is en niet kan worden aangepast.
