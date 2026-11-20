<?php
declare(strict_types=1);

use Dompdf\Canvas;
use Dompdf\FontMetrics;

/** Lay out formatted cell content as lines so a lesson row can span multiple PDF pages. */
final class WordgroupPdfMarkdown {
  private array $lines = [];
  private array $line = [];
  private float $x = 0;
  private float $indent = 0;
  private bool $space = false;

  public function __construct(private FontMetrics $metrics, private float $width, private float $size) {}

  public function lines(string $source): array {
    $markdown = (new Parsedown())->setSafeMode(true)->setStrictMode(true)->setBreaksEnabled(true)->setUrlsLinked(false);
    $document = new DOMDocument();
    $document->loadHTML('<html><head><meta charset="UTF-8"></head><body>' . $markdown->text($source) . '</body></html>', LIBXML_NONET);
    $style = ["size" => $this->size, "bold" => false, "italic" => false, "code" => false, "strike" => false, "link" => ""];
    $this->children($document->getElementsByTagName("body")->item(0), $style);
    $this->finishLine();
    while (end($this->lines) === []) array_pop($this->lines);
    return $this->lines ?: [[]];
  }

  public static function draw(Canvas $canvas, array $line, float $x, float $y, array $ink, array $accent): void {
    foreach ($line as $run) {
      $style = $run["style"];
      $left = $x + $run["x"];
      $right = $left + $run["width"];
      $size = $style["size"];
      $link = $style["link"];
      $color = $link !== "" ? $accent : $ink;
      $canvas->text($left, $y, $run["text"], $style["font"], $size, $color);
      if ($link !== "") {
        $canvas->add_link($link, $left, $y, $run["width"], $size + 2);
        $canvas->line($left, $y + $size + 2, $right, $y + $size + 2, $color, .45);
      }
      if ($style["strike"]) $canvas->line($left, $y + $size * .7, $right, $y + $size * .7, $ink, .45);
    }
  }

  private function children(DOMNode $node, array $style): void {
    foreach ($node->childNodes as $child) $this->visit($child, $style);
  }

  private function visit(DOMNode $node, array $style): void {
    if ($node instanceof DOMText) {
      $this->text($node->data, $style);
      return;
    }
    if (!$node instanceof DOMElement) return;
    switch ($node->tagName) {
      case "br":
        $this->finishLine(true);
        return;
      case "p":
        $this->children($node, $style);
        $this->finishLine();
        if ($node->parentNode->nodeName !== "li") $this->gap();
        return;
      case "h1": case "h2": case "h3": case "h4": case "h5": case "h6":
        $this->finishLine();
        $this->children($node, array_replace($style, ["bold" => true, "size" => $this->size + 1.5]));
        $this->finishLine();
        return;
      case "ul": case "ol":
        $this->listItems($node, $style);
        return;
      case "blockquote":
        $this->finishLine();
        $indent = $this->indent;
        $this->setIndent($indent + 11);
        $this->children($node, array_replace($style, ["italic" => true]));
        $this->finishLine();
        $this->setIndent($indent);
        return;
      case "pre":
        $this->finishLine();
        $style["code"] = true;
        foreach (explode("\n", rtrim($node->textContent, "\n")) as $line) {
          $this->word(str_replace("\t", "    ", $line), $style);
          $this->finishLine(true);
        }
        $this->gap();
        return;
      case "strong": case "b":
        $style["bold"] = true;
        break;
      case "em": case "i":
        $style["italic"] = true;
        break;
      case "code":
        $style["code"] = true;
        break;
      case "del": case "s":
        $style["strike"] = true;
        break;
      case "a":
        $href = $node->getAttribute("href");
        if (preg_match('~^(?:https?://|mailto:)~i', $href)) $style["link"] = $href;
        break;
      case "img":
        // Keep the description without loading a resource referenced by the lesson text.
        $alt = $node->getAttribute("alt");
        $this->text($alt === "" ? "[Afbeelding]" : "[" . $alt . "]", $style);
        return;
      case "tr":
        $this->finishLine();
        foreach ($node->getElementsByTagName("td")->length ? $node->getElementsByTagName("td") : $node->getElementsByTagName("th") as $index => $cell) {
          if ($index > 0) $this->text(" | ", $style);
          $this->children($cell, array_replace($style, ["bold" => $cell->tagName === "th"]));
        }
        $this->finishLine();
        return;
      case "hr":
        $this->finishLine();
        $this->text("────────", $style);
        $this->finishLine();
        return;
    }
    $this->children($node, $style);
  }

  private function listItems(DOMElement $list, array $style): void {
    $this->finishLine();
    $indent = $this->indent;
    $ordered = $list->tagName === "ol";
    $number = $list->hasAttribute("start") ? (int)$list->getAttribute("start") : 1;
    foreach ($list->childNodes as $item) {
      if (!$item instanceof DOMElement || $item->tagName !== "li") continue;
      $prefix = $ordered ? ($number++ . ". ") : "•  ";
      $this->word($prefix, $style);
      $this->indent = min($this->x, max(0, $this->width - 30));
      $this->children($item, $style);
      $this->finishLine();
      $this->setIndent($indent);
    }
    if ($list->parentNode->nodeName !== "li") $this->gap();
  }

  private function text(string $text, array $style): void {
    foreach (preg_split('/([ \t\r\n\f]+)/', $text, -1, PREG_SPLIT_DELIM_CAPTURE | PREG_SPLIT_NO_EMPTY) as $part) {
      if (trim($part) === "") $this->space = $this->line !== [];
      else $this->word($part, $style);
    }
  }

  private function word(string $text, array $style): void {
    $family = $style["code"] ? "DejaVu Sans Mono" : "DejaVu Sans";
    $weight = $style["bold"] ? ($style["italic"] ? "bold_italic" : "bold") : ($style["italic"] ? "italic" : "normal");
    $style["font"] = $this->metrics->getFont($family, $weight);
    $width = $this->measure($text, $style);
    $spaceWidth = $this->space ? $this->measure(" ", $style) : 0;
    if ($this->x > $this->indent && $this->x + $width + $spaceWidth > $this->width) {
      $this->finishLine();
      $spaceWidth = 0;
    }
    if ($spaceWidth) $this->add(" ", $spaceWidth, $style);
    $this->space = false;
    if ($this->x + $width <= $this->width) {
      if ($text !== "") $this->add($text, $width, $style);
      return;
    }
    foreach (preg_split('//u', $text, -1, PREG_SPLIT_NO_EMPTY) ?: [] as $character) {
      $width = $this->measure($character, $style);
      if ($this->line && $this->x + $width > $this->width) $this->finishLine();
      $this->add($character, $width, $style);
    }
  }

  private function measure(string $text, array $style): float {
    return $this->metrics->getTextWidth($text, $style["font"], $style["size"]);
  }

  private function add(string $text, float $width, array $style): void {
    $last = array_key_last($this->line);
    if ($last !== null && $this->line[$last]["style"] === $style) {
      $this->line[$last]["text"] .= $text;
      $this->line[$last]["width"] += $width;
    } else {
      $this->line[] = ["style" => $style, "text" => $text, "width" => $width, "x" => $this->x];
    }
    $this->x += $width;
  }

  private function finishLine(bool $allowEmpty = false): void {
    if ($this->line !== [] || $allowEmpty) $this->lines[] = $this->line;
    $this->line = [];
    $this->x = $this->indent;
    $this->space = false;
  }

  private function gap(): void {
    if ($this->lines && end($this->lines) !== []) $this->lines[] = [];
  }

  private function setIndent(float $indent): void {
    $this->indent = $this->x = min($indent, max(0, $this->width - 30));
  }
}
