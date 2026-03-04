<?php
require_once '../config.php';
header('Content-Type: application/json');

if (!is_logged_in()) { http_response_code(401); echo json_encode(['error'=>'Unauthorized']); exit; }

$url = trim($_GET['url'] ?? '');
if (!$url || !filter_var($url, FILTER_VALIDATE_URL)) {
    http_response_code(400); echo json_encode(['error'=>'Invalid URL']); exit;
}

// Only allow http/https
$scheme = strtolower(parse_url($url, PHP_URL_SCHEME));
if (!in_array($scheme, ['http', 'https'])) {
    http_response_code(400); echo json_encode(['error'=>'Invalid scheme']); exit;
}

// Cache key
$cacheKey = 'lp_' . md5($url);
$cacheFile = sys_get_temp_dir() . '/' . $cacheKey . '.json';
if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < 3600) {
    echo file_get_contents($cacheFile); exit;
}

// Fetch page HTML (max 100KB, 5s timeout)
$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS      => 3,
    CURLOPT_TIMEOUT        => 5,
    CURLOPT_USERAGENT      => 'Mozilla/5.0 (compatible; ChatBot/1.0)',
    CURLOPT_SSL_VERIFYPEER => false,
]);
$html     = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$finalUrl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
curl_close($ch);

if (!$html || $httpCode < 200 || $httpCode >= 400) {
    echo json_encode(['success' => false]); exit;
}

// Truncate to 100KB to avoid memory issues
$html = substr($html, 0, 102400);

// Extract meta tags
function extractMeta($html, $attr, $name) {
    if (preg_match('/<meta[^>]+' . $attr . '\s*=\s*["\']' . preg_quote($name, '/') . '["\'][^>]+content\s*=\s*["\']([^"\']+)["\'][^>]*>/i', $html, $m)) return trim($m[1]);
    if (preg_match('/<meta[^>]+content\s*=\s*["\']([^"\']+)["\'][^>]+' . $attr . '\s*=\s*["\']' . preg_quote($name, '/') . '["\'][^>]*>/i', $html, $m)) return trim($m[1]);
    return null;
}

$title       = extractMeta($html, 'property', 'og:title')
            ?? extractMeta($html, 'name', 'twitter:title');
$description = extractMeta($html, 'property', 'og:description')
            ?? extractMeta($html, 'name', 'description')
            ?? extractMeta($html, 'name', 'twitter:description');
$image       = extractMeta($html, 'property', 'og:image')
            ?? extractMeta($html, 'name', 'twitter:image');
$siteName    = extractMeta($html, 'property', 'og:site_name');

// Fallback: <title> tag
if (!$title && preg_match('/<title[^>]*>([^<]+)<\/title>/i', $html, $m)) {
    $title = trim(html_entity_decode($m[1], ENT_QUOTES | ENT_HTML5, 'UTF-8'));
}

// Make image URL absolute
if ($image && !str_starts_with($image, 'http')) {
    $base = parse_url($finalUrl, PHP_URL_SCHEME) . '://' . parse_url($finalUrl, PHP_URL_HOST);
    $image = $base . '/' . ltrim($image, '/');
}

$result = json_encode([
    'success'     => true,
    'title'       => $title       ? mb_substr($title, 0, 100)       : null,
    'description' => $description ? mb_substr($description, 0, 200) : null,
    'image'       => $image ?: null,
    'site_name'   => $siteName    ? mb_substr($siteName, 0, 60)     : parse_url($finalUrl, PHP_URL_HOST),
    'url'         => $finalUrl,
]);

file_put_contents($cacheFile, $result);
echo $result;
