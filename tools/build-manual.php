<?php
declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use Dompdf\Dompdf;
use Dompdf\Options;

$root = dirname(__DIR__);
$html = file_get_contents($root . '/docs/manual.html');
if ($html === false) {
    throw new RuntimeException('Handleidingbron kon niet worden gelezen.');
}
$options = new Options();
$options->set('isRemoteEnabled', false);
$options->set('defaultFont', 'DejaVu Sans');
$pdf = new Dompdf($options);
$pdf->loadHtml($html, 'UTF-8');
$pdf->setPaper('A4', 'portrait');
$pdf->render();
$canvas = $pdf->getCanvas();
$font = $pdf->getFontMetrics()->getFont('DejaVu Sans', 'normal');
$canvas->page_text(54, 802, 'MPOP | Stap voor stap', $font, 8, [0.34, 0.42, 0.49]);
$canvas->page_text(466, 802, '{PAGE_NUM} / {PAGE_COUNT}', $font, 8, [0.34, 0.42, 0.49]);
$output = $root . '/manual.pdf';
if (file_put_contents($output, $pdf->output()) === false) {
    throw new RuntimeException('manual.pdf kon niet worden geschreven.');
}
echo $output . PHP_EOL;
