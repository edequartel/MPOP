<?php
declare(strict_types=1);

require_once __DIR__ . "/../api/wordgroup_pdf_layout.php";

$sections = [
  "herhaling", "nieuwe_letter", "schrijfmotoriek", "tactiele_discriminatie",
  "auditieve_discriminatie", "auditieve_synthese", "letter_en_woorden_lezen",
  "auditieve_analyse", "dictee", "letters", "woord", "zin",
  "tekst_lezen_leesboek", "tempolezen", "verwerking_werkboek"
];
$plan = ["block" => 1, "week" => 2, "lesson" => 3,
  "goal" => "Leren lezen, schrijven en het klankgebaar maken van de letter p.", "sections" => []];
foreach ($sections as $key) {
  $plan["sections"][$key] = [
    "instruction" => "Bespreek de opdracht met het kind. Geef ieder kind een beurt.\nLaat het kind de letter herkennen, benoemen en schrijven.\nHerhaal de oefening en controleer samen het resultaat.",
    "material" => "Letterbord\nLetterkaart\nSchrift en potlood"
  ];
}
$plan["sections"]["herhaling"]["instruction"] = "Herhaal de eerder aangeleerde letters.\n\n- Wijs de letter aan op het letterbord.\n- Laat het kind de klank zeggen en het gebaar maken.\n- Lees daarna samen de bekende woorden.\n\nDenk aan individuele beurten.";
$second = $plan;
$second["lesson"] = 4;
$second["goal"] = "Leren lezen en schrijven van de lettercombinatie aa.";
$lessons = [
  ["letter" => "aa", "lesson_order" => 2, "lesson_plan" => $second],
  ["letter" => "p", "lesson_order" => 1, "lesson_plan" => $plan]
];
$directory = __DIR__ . "/../tmp/pdfs";
if (!is_dir($directory)) mkdir($directory, 0775, true);
$normal = render_wordgroup_pdf(["title" => "aap"], $lessons);
if (!str_starts_with($normal, "%PDF-")) throw new RuntimeException("No PDF generated.");
file_put_contents($directory . "/wordgroup-layout-smoke.pdf", $normal);
file_put_contents($directory . "/wordgroup-single-letter-smoke.pdf", render_wordgroup_pdf(["title" => "aap"], [$lessons[1]]));

$overflow = $plan;
$overflow["goal"] = str_repeat("Een uitgebreid doel met meerdere regels, zodat ook dit veld veilig op vervolgpagina's wordt weergegeven. ", 70);
$overflow["sections"]["herhaling"]["instruction"] = implode("\n", array_map(
  static fn(int $index): string => "CONTROLE-" . str_pad((string)$index, 3, "0", STR_PAD_LEFT) . ": Bespreek deze oefening en controleer samen het resultaat.", range(1, 100)
));
$overflow["sections"]["herhaling"]["material"] = "EenLangeMateriaalnaamZonderSpaties" . str_repeat("abcdefghij", 25);
$overflow["sections"]["zin"]["instruction"] = "Tekst met accenten: één, naïef en coördinatie. <script> blijft gewone tekst.";
file_put_contents($directory . "/wordgroup-overflow-smoke.pdf", render_wordgroup_pdf(["title" => "aap"], [
  ["letter" => "p", "lesson_order" => 1, "lesson_plan" => $overflow]
]));
echo $directory . "/wordgroup-layout-smoke.pdf\n";
echo $directory . "/wordgroup-overflow-smoke.pdf\n";
