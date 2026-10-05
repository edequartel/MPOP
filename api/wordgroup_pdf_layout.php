<?php
declare(strict_types=1);

require_once __DIR__ . "/../vendor/autoload.php";

use Dompdf\Dompdf;
use Dompdf\FontMetrics;
use Dompdf\Options;

function wordgroup_pdf_text($value): string {
  return is_scalar($value) ? (string)$value : "";
}

/** Wrap using actual font widths, including long words and explicit blank lines. */
function wordgroup_pdf_lines(string $text, FontMetrics $metrics, string $font, float $width, float $size): array {
  $lines = [];
  foreach (preg_split('/\R/u', $text) ?: [""] as $paragraph) {
    $line = "";
    foreach (preg_split('/\s+/u', trim($paragraph), -1, PREG_SPLIT_NO_EMPTY) ?: [] as $word) {
      $candidate = $line === "" ? $word : $line . " " . $word;
      if ($metrics->getTextWidth($candidate, $font, $size) <= $width) {
        $line = $candidate;
        continue;
      }
      if ($line !== "") $lines[] = $line;
      $line = "";
      foreach (preg_split('//u', $word, -1, PREG_SPLIT_NO_EMPTY) ?: [] as $character) {
        if ($line !== "" && $metrics->getTextWidth($line . $character, $font, $size) > $width) {
          $lines[] = $line;
          $line = "";
        }
        $line .= $character;
      }
    }
    $lines[] = $line;
  }
  return $lines ?: [""];
}

function render_wordgroup_pdf(array $word, array $lessons): string {
  $sections = [
    "herhaling" => "Herhaling", "nieuwe_letter" => "Nieuwe letter",
    "schrijfmotoriek" => "Schrijfmotoriek", "tactiele_discriminatie" => "Tactiele discriminatie",
    "auditieve_discriminatie" => "Auditieve discriminatie", "auditieve_synthese" => "Auditieve synthese",
    "letter_en_woorden_lezen" => "Letter en woorden lezen", "auditieve_analyse" => "Auditieve analyse",
    "dictee" => "Dictee", "letters" => "Letters", "woord" => "Woord", "zin" => "Zin",
    "tekst_lezen_leesboek" => "Tekst lezen leesboek", "tempolezen" => "Tempolezen",
    "verwerking_werkboek" => "Verwerking werkboek"
  ];
  usort($lessons, static fn(array $a, array $b): int => ($a["lesson_order"] ?? 0) <=> ($b["lesson_order"] ?? 0));
  $options = new Options();
  $options->set("defaultFont", "DejaVu Sans");
  $dompdf = new Dompdf($options);
  $dompdf->setPaper("A4", "portrait");
  $dompdf->loadHtml('<html><body></body></html>');
  $dompdf->render();
  $canvas = $dompdf->getCanvas();
  $metrics = $dompdf->getFontMetrics();
  $regular = $metrics->getFont("DejaVu Sans", "normal");
  $bold = $metrics->getFont("DejaVu Sans", "bold");
  $headingFont = $metrics->getFont("DejaVu Sans", "bold_italic");
  $ink = [0.08, 0.09, 0.10];
  $accent = [0.19, 0.34, 0.38];
  $rule = [0.55, 0.62, 0.64];
  $left = 51.0;
  $width = $canvas->get_width() - 2 * $left;
  $bottom = $canvas->get_height() - 65;
  $columnWidths = [$width * .15, $width * .65, $width * .20];
  $columnX = [$left, $left + $columnWidths[0], $left + $columnWidths[0] + $columnWidths[1]];
  $size = 10.0;
  $lineHeight = 14.0;
  $started = false;
  $y = 0.0;

  foreach ($lessons as $lesson) {
    $plan = is_array($lesson["lesson_plan"] ?? null) ? $lesson["lesson_plan"] : [];
    $number = static fn(string $key): string => wordgroup_pdf_text($plan[$key] ?? null) ?: "-";
    $heading = "Blok " . $number("block") . "  Week " . $number("week") . "  Les " . $number("lesson");
    $context = "Woordgroep " . wordgroup_pdf_text($word["title"] ?? "") . " - Letter " . wordgroup_pdf_text($lesson["letter"] ?? "");
    $newPage = function (bool $continuation) use (&$started, &$y, $canvas, $metrics, $heading, $context, $headingFont, $regular, $bold, $accent, $rule, $left, $width): void {
      if ($started) $canvas->new_page();
      $started = true;
      $canvas->text($left, 48, $heading, $headingFont, 20, $accent);
      $canvas->line($left, 81, $left + $width, 81, $rule, .6);
      $contextLines = wordgroup_pdf_lines($context . ($continuation ? " (vervolg)" : ""), $metrics, $regular, $width, 9);
      $y = 91;
      foreach ($contextLines as $line) {
        $canvas->text($left, $y, $line, $regular, 9, $accent);
        $y += 13;
      }
      $y += 13;
    };
    $tableHeader = function () use (&$y, $canvas, $columnX, $left, $width, $bold, $accent, $rule): void {
      foreach (["ONDERDEEL", "INSTRUCTIE", "MATERIAAL"] as $index => $label) {
        $canvas->text($columnX[$index] + 5, $y + 4, $label, $bold, 9, $accent);
      }
      $canvas->line($left, $y + 23, $left + $width, $y + 23, $rule, .6);
      for ($i = 1; $i < 3; $i++) $canvas->line($columnX[$i], $y, $columnX[$i], $y + 23, $rule, .4);
      $y += 23;
    };
    $newPage(false);
    $goalLines = wordgroup_pdf_lines("Doel: " . wordgroup_pdf_text($plan["goal"] ?? ""), $metrics, $bold, $width - 16, $size);
    // Even unusually long goals and table rows continue on new pages without clipping.
    foreach (array_chunk($goalLines, 35) as $index => $goalChunk) {
      if ($index > 0) $newPage(true);
      $height = count($goalChunk) * $lineHeight + 14;
      $canvas->filled_rectangle($left, $y, $width, $height, [.85, .90, .91]);
      foreach ($goalChunk as $lineIndex => $line) $canvas->text($left + 8, $y + 7 + $lineIndex * $lineHeight, $line, $bold, $size, $ink);
      $y += $height + 17;
    }
    $tableHeader();

    foreach ($sections as $key => $label) {
      $section = is_array($plan["sections"][$key] ?? null) ? $plan["sections"][$key] : [];
      $columns = [
        wordgroup_pdf_lines($label, $metrics, $bold, $columnWidths[0] - 10, $size),
        wordgroup_pdf_lines(wordgroup_pdf_text($section["instruction"] ?? ""), $metrics, $regular, $columnWidths[1] - 10, $size),
        wordgroup_pdf_lines(wordgroup_pdf_text($section["material"] ?? ""), $metrics, $regular, $columnWidths[2] - 10, $size)
      ];
      $offset = 0;
      $totalLines = max(array_map("count", $columns));
      while ($offset < $totalLines) {
        $labelLines = $offset === 0 ? $columns[0] : wordgroup_pdf_lines($label . " (vervolg)", $metrics, $bold, $columnWidths[0] - 10, $size);
        $capacity = (int)floor(($bottom - $y - 12) / $lineHeight);
        if ($capacity < max(count($labelLines), 2)) {
          $newPage(true);
          $tableHeader();
          $capacity = (int)floor(($bottom - $y - 12) / $lineHeight);
        }
        $take = min($capacity, $totalLines - $offset);
        $rowColumns = [$labelLines, array_slice($columns[1], $offset, $take), array_slice($columns[2], $offset, $take)];
        $height = max(array_map("count", $rowColumns)) * $lineHeight + 12;
        foreach ($rowColumns as $column => $lines) {
          foreach ($lines as $lineIndex => $line) {
            $canvas->text($columnX[$column] + 5, $y + 6 + $lineIndex * $lineHeight, $line, $column === 0 ? $bold : $regular, $size, $ink);
          }
        }
        for ($i = 1; $i < 3; $i++) $canvas->line($columnX[$i], $y, $columnX[$i], $y + $height, $rule, .4);
        $canvas->line($left, $y + $height, $left + $width, $y + $height, $rule, .5);
        $y += $height;
        $offset += $take;
      }
    }
  }
  $canvas->page_text($left, $canvas->get_height() - 35, "{PAGE_NUM}", $regular, 9, $ink);
  return $dompdf->output();
}
