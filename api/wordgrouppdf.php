<?php
declare(strict_types=1);

ini_set("display_errors", "0");
require_once __DIR__ . "/server_auth.php";
require_once __DIR__ . "/wordgroup_pdf_layout.php";

cors_preflight("GET, OPTIONS");
if ($_SERVER["REQUEST_METHOD"] !== "GET") {
  json_out(405, ["ok" => false, "error" => "Method not allowed."]);
}
$auth = require_allowed_role(["admin", "editor", "soundcreator"]);
$id = trim((string)($_GET["id"] ?? ""));
$lessonId = trim((string)($_GET["lesson_id"] ?? ""));
$singleLesson = $lessonId !== "";
if (($singleLesson && in_array($lessonId, ["undefined", "null"], true))
  || (!$singleLesson && ($id === "" || in_array($id, ["undefined", "null"], true)))) {
  json_out(400, ["ok" => false, "error" => "Kies eerst een woordgroep."]);
}
$base = rtrim($SUPABASE_URL, "/") . "/rest/v1/mpop_items";
$lessons = [];
if ($singleLesson) {
  $lessons = supabase_get_json($base
    . "?select=id,letter,lesson_order,lesson_plan,parent_item_id&item_type=eq.letter&id=eq."
    . rawurlencode($lessonId) . "&limit=1", $auth["jwt"]);
  if (!is_array($lessons[0] ?? null) || empty($lessons[0]["parent_item_id"])) {
    json_out(404, ["ok" => false, "error" => "Letterles niet gevonden."]);
  }
  $id = (string)$lessons[0]["parent_item_id"];
}
$items = supabase_get_json($base . "?select=id,title,item_type&id=eq." . rawurlencode($id) . "&limit=1", $auth["jwt"]);
$item = $items[0] ?? null;
if (!is_array($item) || ($item["item_type"] ?? "") !== "word") {
  json_out(404, ["ok" => false, "error" => "Woordgroep niet gevonden."]);
}
if (!$singleLesson) {
  $lessons = supabase_get_json($base
    . "?select=id,letter,lesson_order,lesson_plan&item_type=eq.letter&parent_item_id=eq."
    . rawurlencode((string)$item["id"]) . "&order=lesson_order.asc", $auth["jwt"]);
}
if (!$lessons) {
  json_out(422, ["ok" => false, "error" => "Voeg eerst een letterles toe aan deze woordgroep."]);
}

try {
  $pdf = render_wordgroup_pdf($item, $lessons);
} catch (Throwable $error) {
  error_log("Woordgroep PDF: " . $error->getMessage());
  json_out(500, ["ok" => false, "error" => "Woordgroep PDF maken mislukt."]);
}
$safeTitle = trim(preg_replace('/[^A-Za-z0-9_-]+/', '-', (string)$item["title"]) ?? "", "-") ?: "woordgroep";
header("Content-Type: application/pdf");
$filename = "mpop-woordgroep-" . $safeTitle;
if ($singleLesson) {
  $safeLetter = trim(preg_replace('/[^A-Za-z0-9_-]+/', '-', (string)$lessons[0]["letter"]) ?? "", "-") ?: "letter";
  $filename = "mpop-letterles-" . $safeTitle . "-" . $safeLetter;
}
header('Content-Disposition: inline; filename="' . $filename . '.pdf"');
header("Cache-Control: no-store");
echo $pdf;
