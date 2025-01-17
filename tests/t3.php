<?php

define('VERSION', '3.0.0');

define('PUBLIC_FOLDER', __DIR__ . '/public');

$[if `process.env.TIMING`]$
$time_start = hrtime(true); 
$[end]$

function human_filesize($bytes, $decimals = 2): string
{
  $sz = ' KMGTP';
  $factor = floor((strlen($bytes) - 1) / 3);
  return sprintf("%.{$decimals}f", $bytes / pow(1024, $factor)) . @$sz[$factor] . "B";
}

function numsize($size, $round = 2)
{
  if ($size === 0) return '0';
  $unit = ['', 'K', 'M', 'B', 'T'];
  return round($size / pow(1000, ($i = floor(log($size, 1000)))), $round) . $unit[$i];
}

// fix whitespace in path results in not found errors
$request_uri = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));

$url_parts = array_filter(explode(separator: '/', string: $request_uri), fn ($part) => $part !== '');

// get real path and check if accessible (open_basedir)
$local_path = realpath(PUBLIC_FOLDER . $request_uri);

// check if path is dir
$path_is_dir = is_dir($local_path);

class File
{
  public string $name;
  public string $url;
  public string $size;
  public bool $is_dir;
  public string $modified_date;
  public int $dl_count;
  public ?object $meta;

  public function __toString(): string
  {
    return $this->name;
  }
}

/* @var array<File> */
$sorted = [];

$total_items = 0;
$total_size = 0;

// local path exists
if ($path_is_dir) {
  $[if `!process.env.NO_DL_COUNT`]$
  $redis = new Redis();
  $redis->connect('127.0.0.1', 6379);
  $[end]$
  // TODO: refactor use MGET instead of loop GET

  $sorted_files = [];
  $sorted_folders = [];
  foreach (($files = scandir($local_path)) as $file) {
    // always skip current folder '.' or parent folder '..' if current path is root or file should be ignored or .dbmeta.json
    if ($file === '.' || $file === '..' && count($url_parts) === 0 $[if `process.env.IGNORE`]$|| $file !== '..' && fnmatch("${{`process.env.IGNORE ?? ""`}}$", $file)$[end]$ || str_contains($file, ".dbmeta.json")) continue;

    $[if `process.env.IGNORE`]$
    foreach ($url_parts as $int_path) { /* check if parent folders are hidden */
      if (fnmatch("${{`process.env.IGNORE ?? ""`}}$", $int_path)) {
        $path_is_dir = false;
        goto skip; /* Folder should be ignored so skip to 404 */
      }
    }
    $[end]$

    // remove '/var/www/public' from path
    $url = substr($local_path, strlen(PUBLIC_FOLDER)) . '/' . $file;

    $file_size = filesize($local_path . '/' . $file);

    $is_dir = is_dir($local_path . '/' . $file);

    $file_modified_date = gmdate('Y-m-d\TH:i:s\Z', filemtime($local_path . '/' . $file));

    // load metadata if file exists
    $meta_file = realpath($local_path . '/' . $file . '.dbmeta.json');
    if ($meta_file !== false) {
      $meta = json_decode(file_get_contents($meta_file));
      if ($meta !== null && $meta->hidden === true) continue;
    } else {
      // Variables stay alive in php so we need to reset it explicitly
      $meta = null;
    }

    $item = new File();
    $item->name = $file;
    $item->url = $url;
    $item->size = $file_size;
    $item->is_dir = $is_dir;
    $item->modified_date = $file_modified_date;
    $item->dl_count =  $[if `!process.env.NO_DL_COUNT`]$!$is_dir ? $redis->get($url) :$[end]$ 0;
    $item->meta = $meta ?? null;
    if ($is_dir) {
      array_push($sorted_folders, $item);
    } else {
      array_push($sorted_files, $item);
    }

    // don't count parent folder
    if ($file !== "..") $total_items++;
    $total_size += $file_size;
  }

  natcasesort($sorted_folders);
  natcasesort($sorted_files);
  $[if `process.env.REVERSE_SORT`]$
  $sorted_folders = array_reverse($sorted_folders);
  $sorted_files = array_reverse($sorted_files);
  $[end]$
  $sorted = array_merge($sorted_folders, $sorted_files);

  // if list request return json
  if(isset($_REQUEST["ls"])) {
    $info = [];
    foreach ($sorted as $file) {
      $info[] = [
        "url" => $file->url,
        "name" => $file->name,
        "type" => $file->is_dir ? "dir" : "file",
        "size" => $file->size,
        "modified" => $file->modified_date,
        "downloads" => $[if `!process.env.NO_DL_COUNT`]$ intval($redis->get($file->url))$[else]$0$[end]$
      ];
    }
    header("Content-Type: application/json");
    die(json_encode($info));
  }
} elseif (file_exists($local_path)) {
  // local path is file. serve it directly using nginx

  $relative_path = substr($local_path, strlen(PUBLIC_FOLDER));

  $[if `process.env.IGNORE`]$
  foreach ($url_parts as $int_path) { /* check if parent folders are hidden */
    if (fnmatch("${{`process.env.IGNORE ?? ""`}}$", $int_path)) {      
      goto skip; /* File should be ignored so skip to 404 */
    }
  }
  $[end]$

  // skip if file is .dbmeta.json
  if (str_contains($local_path, ".dbmeta.json")) goto skip;

  // check if password proteced
  if (file_exists($local_path . '.dbmeta.json')) {
    $meta = json_decode(file_get_contents($local_path . '.dbmeta.json'));
    if (isset($meta->password)) {
      if (!isset($_REQUEST["key"]) || $_REQUEST["key"] !== $meta->password) { // allows get and post reqeusts
        http_response_code(401);
        define('AUTH_REQUIRED', true);
        goto end;
      }
    }
  }

  $[if `process.env.HASH`]$
  // only allow download if requested hash matches actual hash
  if (isset($_REQUEST["hash"]) || isset($meta) && $meta->hash_required === true) {
    if ($_REQUEST["hash"] !== hash_file('sha256', $local_path)) {
      http_response_code(403);
      die("<b>Access denied.</b> Supplied hash does not match actual file hash.");
    }
  }
  $[end]$

  // increment redis view counter
  $[if `!process.env.NO_DL_COUNT`]$
  $redis = new Redis();
  $redis->connect('127.0.0.1', 6379);
  $redis->incr($relative_path);
  $[end]$

  if(isset($_REQUEST["info"])) {
    $info = [
      "path" => $relative_path,
      "name" => basename($local_path),
      "mime" => mime_content_type($local_path) ?? "application/octet-stream",
      "size" => filesize($local_path),
      "modified" => filemtime($local_path),
      "downloads" => $[if `!process.env.NO_DL_COUNT`]$ intval($redis->get($relative_path))$[else]$0$[end]$,
      "hash_sha256" => $[if `process.env.HASH`]$hash_file('sha256', $local_path)$[else]$null$[end]$
    ];
    header("Content-Type: application/json");
    die(json_encode($info));
  }
   
  // let nginx guess content type
  header("Content-Type: ");
  // let nginx handle file serving
  header("X-Accel-Redirect: /__internal_public__" . $relative_path);
  die();
} else {
  // local path does not exist
skip:
  http_response_code(404);
end: 
}
?>
<!doctype html>
<html lang="en" data-bs-theme="light">

<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="turbo-cache-control" content="no-cache">
  <title>Dir Browser - <?= '/' . implode(separator: '/', array: $url_parts) ?></title>
  $[ifeq env:THEME cerulean]$
  <link href="https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/cerulean/bootstrap.min.css" rel="stylesheet" data-turbo-eval="false">
  $[ifeq env:THEME materia]$
  <link href="https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/materia/bootstrap.min.css" rel="stylesheet" data-turbo-eval="false">
  $[ifeq env:THEME quartz]$
  <link href="https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/quartz/bootstrap.min.css" rel="stylesheet" data-turbo-eval="false">
  $[ifeq env:THEME sandstone]$
  <link href="https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/sandstone/bootstrap.min.css" rel="stylesheet" data-turbo-eval="false">
  $[ifeq env:THEME sketchy]$
  <link href="https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/sketchy/bootstrap.min.css" rel="stylesheet" data-turbo-eval="false">
  $[ifeq env:THEME united]$
  <link href="https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/united/bootstrap.min.css" rel="stylesheet" data-turbo-eval="false">
  $[ifeq env:THEME yeti]$
  <link href="https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/yeti/bootstrap.min.css" rel="stylesheet" data-turbo-eval="false">
  $[ifeq env:THEME litera]$
  <link href="https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/litera/bootstrap.min.css" rel="stylesheet" data-turbo-eval="false">
  $[else]$
  <link href="https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/cosmo/bootstrap.min.css" rel="stylesheet" data-turbo-eval="false">
  $[end]$
  <style data-turbo-eval="false">
    $[ifeq env:THEME default]$
    [data-bs-theme=dark] {
      --bs-body-bg: #000000;
      --bs-secondary-bg: #000000;
      --bs-tertiary-bg: #000000;
      --bs-tertiary-bg-rgb: 0, 0, 0;
      #filetree > a:hover {
        background-color: #ffffff0d;
      }
    }
    $[end]$
    .item {
      grid-auto-flow: column dense;
      grid-template-columns: 20px auto 100px 75px max-content;
    }
    @media screen and (max-width: 768px) {
      .item {
        grid-auto-flow: column dense;
        grid-template-columns: 20px auto 0 0 0;
      }
    }
    .icon:before {
      font-size: 18px !important;
      width: 18px !important;
    }
    .icon {
      width: 24px !important;
      height: 24px !important;
      text-align: center;
    }
    body {
      background-color: var(--bs-secondary-bg);
    }
    .footer {
      color: var(--bs-tertiary-color)
    }
    .db-row {
      text-decoration: unset;
      /* background-color: var(--bs-tertiary-bg); */
    }
    a {
      color: inherit;
      text-decoration: none;
    }
    #path > a:hover {
      text-decoration:underline;
      text-decoration-style: dotted;
    }
    #path > a:last-child {
      font-weight: bold;
    }
    #readme a, #readme a:hover {
      all: revert;
    }
    #filetree > a:hover {
      background-color: var(--bs-tertiary-bg);
    }
    #filetree > a {
      border-bottom: var(--bs-border-width) var(--bs-border-style) var(--bs-border-color) !important;
    }
    #filetree > a:last-child {
      border-bottom: none !important;
    }
    #sort > a > svg {
      width: 16px !important;
      height: 16px !important;
      display: none;
    }
    #sort > a:hover > svg {
      display: inline;
    }
  </style>
  $[if `process.env.ICONS !== "false"`]$
  <link data-turbo-eval="false" href="https://cdn.jsdelivr.net/npm/file-icons-js@1/css/style.min.css" rel="stylesheet"></link>
  $[end]$
  <script src="https://cdn.jsdelivr.net/npm/@hotwired/turbo@8.0/dist/turbo.es2017-umd.min.js"></script>
</head>

<body class="d-flex flex-column min-vh-100">
  <div class="container py-3">
    <?php if (defined("AUTH_REQUIRED")) { ?>
      <div class="card rounded border-2 m-auto" style="max-width: 500px;">
        <div class="card-body">
          <h4 class="alert-heading key-icon">Protected file</h4>
          <p class="mb-2">Please enter the password to access this file.</p>
          <form method="post">
            <input autofocus type="password" class="form-control mb-2 rounded" id="key" name="key" required>
            <button type="submit" class="btn rounded btn-primary key-icon form-control">Continue</button>
          </form>
        </div>
      </div>
    <?php } else if (!$path_is_dir) { ?>
      <div class="alert alert-secondary text-center" role="alert">
        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-file-unknown" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
          <path d="M14 3v4a1 1 0 0 0 1 1h4"></path>
          <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z"></path>
          <path d="M12 17v.01"></path>
          <path d="M12 14a1.5 1.5 0 1 0 -1.14 -2.474"></path>
        </svg>
        Not Found<br>
        <a class="btn btn-outline-secondary mt-2" href="${{`process.env.BASE_PATH ?? ''`}}$/">Back to Home</a>
      </div>

    <?php } else { ?>
      <div class="rounded container card border-2  px-3" id="filetree">
        <div class="row db-row py-2 text-muted">
          <div class="col" id="path">
            <a href="${{`process.env.BASE_PATH ?? ''`}}$/">/</a><?php
            // create links e.g. from ["foo","bar","foobar"] to ["/foo", "/foo/bar", "/foo/bar/foobar"]
            $urls = [];
            foreach ($url_parts as $i => $part) {
              $urls[] = end($urls) . '/' . $part;
              // var_dump($i, $part, $urls);
              echo '<a href="${{`process.env.BASE_PATH ?? ''`}}$' . $urls[$i - 1] . '">' . $part . '/</a>';
            }
            ?>
          </div>
          <div class="col-auto pe-0">
            <a class="btn rounded btn-sm text-muted" onclick="toggleSearch()">
            <svg  xmlns="http://www.w3.org/2000/svg"  width="24"  height="24"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-search"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" /><path d="M21 21l-6 -6" /></svg>
            </a>
            <a class="btn rounded btn-sm text-muted" data-color-toggler onclick="toggletheme()">
            <svg  xmlns="http://www.w3.org/2000/svg"  width="24"  height="24"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-moon"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z" /></svg>
            </a>
          </div>
        </div>
        <div class="row db-row py-2 text-muted d-none" id="search-container">
          <div class="col">
            <input type="text" class="form-control rounded" placeholder="Search" id="search">
          </div>
        </div>
        <div class="row db-row py-2 text-muted" id="sort">
          <a href="" class="col" id="name">Name<svg  xmlns="http://www.w3.org/2000/svg"  width="24"  height="24"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-arrows-sort"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 9l4 -4l4 4m-4 -4v14" /><path d="M21 15l-4 4l-4 -4m4 4v-14" /></svg></a>
          $[if `!process.env.NO_DL_COUNT`]$<a href="" class="col col-auto text-end d-none d-md-inline-block" id="dl">Downloads<svg  xmlns="http://www.w3.org/2000/svg"  width="24"  height="24"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-arrows-sort"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 9l4 -4l4 4m-4 -4v14" /><path d="M21 15l-4 4l-4 -4m4 4v-14" /></svg></a>$[end]$
          <a href="" class="col col-2 text-end d-none d-md-inline-block" id="size">Size<svg  xmlns="http://www.w3.org/2000/svg"  width="24"  height="24"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-arrows-sort"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 9l4 -4l4 4m-4 -4v14" /><path d="M21 15l-4 4l-4 -4m4 4v-14" /></svg></a>
          <a href="" class="col col-2 text-end d-none d-md-inline-block" id="mod">Modified<svg  xmlns="http://www.w3.org/2000/svg"  width="24"  height="24"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-arrows-sort"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 9l4 -4l4 4m-4 -4v14" /><path d="M21 15l-4 4l-4 -4m4 4v-14" /></svg></a>
        </div>
        <?php
        $now = new DateTime();
        foreach ($sorted as $file) {
          $fileDate = new DateTime($file->modified_date);
          $diff = $now->diff($fileDate)->days;
        ?>
        <a data-file-isdir="<?= $file->is_dir ? "1" : "0" ?>" data-file-name="<?= $file->name ?>" data-file-dl="$[if `!process.env.NO_DL_COUNT`]$<?= $file->dl_count ?>$[end]$" data-file-size="<?= $file->size ?>" data-file-mod="<?= $file->modified_date ?>"  href="${{`process.env.BASE_PATH ?? ''`}}$<?= $file->url ?>" class="row db-row py-2 db-file">
          <div class="col col-auto pe-0">
          <?php if ($file->name === "..") { ?>
              <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-corner-left-up" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                <path d="M18 18h-6a3 3 0 0 1 -3 -3v-10l-4 4m8 0l-4 -4"></path>
              </svg>
            <?php } elseif ($file->is_dir) { ?>
              <div class="dir-icon-placeholder" dirname="<?= $file->name ?>">
                <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-folder-filled" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                  <path d="M9 3a1 1 0 0 1 .608 .206l.1 .087l2.706 2.707h6.586a3 3 0 0 1 2.995 2.824l.005 .176v8a3 3 0 0 1 -2.824 2.995l-.176 .005h-14a3 3 0 0 1 -2.995 -2.824l-.005 -.176v-11a3 3 0 0 1 2.824 -2.995l.176 -.005h4z" stroke-width="0" fill="currentColor"></path>
                </svg>
              </div>
            <?php } else { ?>
              <div class="file-icon-placeholder" filename="<?= $file->name ?>">
                <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-file" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                  <path d="M14 3v4a1 1 0 0 0 1 1h4"></path>
                  <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z"></path>
                </svg>
              </div>
            <?php } ?>
            </div> 
            <div class="col">
            <?= $file->name ?>
            <?php 
              if ($file->meta !== null) {
                if ($file->meta->description !== null) {
            ?> 
                  <span class="text-body-secondary"><?= $file->meta->description ?></span>
            <?php
                }
                foreach ($file->meta->labels as $lbl) {
                  $l = explode(":", $lbl, 2);
            ?>
                  <span class="badge bg-<?= $l[0] ?>"><?= $l[1] ?></span>
            <?php
                }
                if ($file->meta->password !== null) {
            ?>
              <span title="Password protected" class="key-icon"></span>
            <?php
                }
              }
            ?>
            </div>
            <?php if (!$file->is_dir) { ?>
            <div class="col col-auto text-end">
              $[if `!process.env.NO_DL_COUNT`]$
              <span title="Total downloads" class="text-muted ms-auto d-none d-md-inline rounded-1 text-end px-1 <?= $file->dl_count === 0 ? "text-body-tertiary" : "" ?>">
                <?= numsize($file->dl_count) ?>
                <svg style="margin-top: -5px;" xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-download" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                  <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2"></path>
                  <path d="M7 11l5 5l5 -5"></path>
                  <path d="M12 4l0 12"></path>
                </svg>
              </span>
              $[end]$
            </div>
            <div class="col col-2 text-end">    
              <span title="File size" class="ms-auto d-none d-md-inline rounded-1 text-end px-1">
                <?= human_filesize($file->size) ?>
              </span>
            </div>
            <?php } ?>
            <div class="col col-2">
              <span title="Last modified on <?= $file->modified_date ?>" class="d-none d-md-block text-end filedatetime" ${{`process.env.HIGHLIGHT_UPDATED !== "false" && 'style="font-weight:<?= ($diff > 2 ? "normal !important;": "bold !important;") ?>"'`}}$>
                <?= $file->modified_date ?>
              </span>
            </div>
          </a>

        <?php
        }
        ?>

        <?php if (count($sorted_files) === 0 && (count($sorted_folders) === 0 || count($sorted_folders) === 1 && $sorted_folders[0]->name === "..")) { ?>
          <div class="list-group-item text-center py-3" role="alert">
            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-folder-off" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
              <path d="M3 3l18 18"></path>
              <path d="M19 19h-14a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 1.172 -1.821m3.828 -.179h1l3 3h7a2 2 0 0 1 2 2v8"></path>
            </svg>
            Empty Folder
          </div>
        <?php } ?>
      </div>
    <?php } ?>
  </div>

  $[if `!process.env.NO_README_RENDER`]$
  <?php
    // check if readme exists
    foreach ($sorted_files as $file) {
      if (strtolower($file->name) === "readme.md") {
        $readme = $file;
        break;
      }
    }

    require __DIR__ . "/vendor/autoload.php";
    use League\CommonMark\Environment\Environment;
    use League\CommonMark\Extension\Autolink\AutolinkExtension;
    use League\CommonMark\Extension\CommonMark\CommonMarkCoreExtension;
    use League\CommonMark\Extension\DisallowedRawHtml\DisallowedRawHtmlExtension;
    use League\CommonMark\Extension\Strikethrough\StrikethroughExtension;
    use League\CommonMark\Extension\Table\TableExtension;
    use League\CommonMark\Extension\TaskList\TaskListExtension;
    use League\CommonMark\MarkdownConverter;

    if ($readme) {
      // Define your configuration, if needed
      $config = [];

      // Configure the Environment with all the CommonMark parsers/renderers
      $environment = new Environment($config);
      $environment->addExtension(new CommonMarkCoreExtension());

      // Remove any of the lines below if you don't want a particular feature
      $environment->addExtension(new AutolinkExtension());
      ${{`!process.env.ALLOW_RAW_HTML ? "$environment->addExtension(new DisallowedRawHtmlExtension());" : ""`}}$ 
      $environment->addExtension(new StrikethroughExtension());
      $environment->addExtension(new TableExtension());
      $environment->addExtension(new TaskListExtension());
      $converter = new MarkdownConverter($environment);

      $readme_render = $converter->convert(file_get_contents(PUBLIC_FOLDER . $readme->url));
  ?>
  <div class="container pb-3">
    <div class="card rounded border-2 p-3" id="readme">
      <?= $readme_render ?>
    </div>
  </div>
  <?php 
  }
  ?>
  $[end]$

  <div class="bg-body-tertiary mt-auto">
    <div class="container py-2 text-center" id="footer">
      <?= $total_items ?> Items | <?= human_filesize($total_size) ?> $[if `process.env.TIMING`]$| <?= (hrtime(true) - $time_start)/1000000 ?> ms $[end]$ $[if `!process.env.HIDE_ATTRIBUTION`]$<br>
    <span style="opacity:0.8"><span style="opacity: 0.8;">Powered by</span>  <a href="https://github.com/adrianschubek/dir-browser" class="text-decoration-none text-primary" target="_blank">dir-browser</a> <?= VERSION ?>$[end]$</span>  
    </div>
  </div>

  $[ifeq env:LAYOUT popup]$
  <div class="modal rounded fade show" style="background-color:rgba(0, 0, 0, 0.2);" id="file-popup" data-bs-backdrop="static" data-bs-keyboard="false" tabindex="-1" aria-labelledby="staticBackdropLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-scrollable">
      <div class="modal-content rounded border-2">
        <div class="modal-header">
          <h1 class="modal-title fs-5" id="staticBackdropLabel">Modal title</h1>
          <button type="button" class="btn-close" id="file-popup-x" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          ...
        </div>
        <div class="modal-footer">
          <a id="file-info-url-api" href="" type="button" class="btn rounded btn-secondary" data-bs-dismiss="modal">API <svg  xmlns="http://www.w3.org/2000/svg"  width="24"  height="24"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-code"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M7 8l-4 4l4 4" /><path d="M17 8l4 4l-4 4" /><path d="M14 4l-4 16" /></svg></a>
          <a id="file-info-url" type="button" class="btn rounded btn-primary">Download <svg  xmlns="http://www.w3.org/2000/svg"  width="24"  height="24"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-download"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" /><path d="M7 11l5 5l5 -5" /><path d="M12 4l0 12" /></svg></a>
        </div>
      </div>
    </div>
  </div>
  $[end]$

  <!-- Powered by https://github.com/adrianschubek/dir-browser -->
  <script>
    $[if `process.env.DATE_FORMAT === "relative"`]$
    function getRelativeTimeString(date, lang = navigator.language) {
      const timeMs = typeof date === "number" ? date : date.getTime();
      const deltaSeconds = Math.round((timeMs - Date.now()) / 1000);

      const cutoffs = [60, 3600, 86400, 86400 * 7, 86400 * 30, 86400 * 365, Infinity];
      const units = ["second", "minute", "hour", "day", "week", "month", "year"];

      // Find the ideal cutoff unit by iterating manually
      let unitIndex = 0;
      while (unitIndex < cutoffs.length && Math.abs(deltaSeconds) >= cutoffs[unitIndex]) {
        unitIndex++;
      }

      // Calculate the time difference in the current unit
      const timeInCurrentUnit = Math.abs(deltaSeconds) / (unitIndex ? cutoffs[unitIndex - 1] : 1);

      // Adjust the displayed time based on the 50% threshold
      const adjustedTime = Math.floor(timeInCurrentUnit);

      // Include the negative sign for time that has passed
      const sign = deltaSeconds < 0 ? "-" : "";

      const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
      return rtf.format(sign + adjustedTime, units[unitIndex]);
    }
    $[end]$

    document.querySelectorAll(".filedatetime").forEach(function(element) {
      $[if `process.env.DATE_FORMAT === "utc"`]$
      element.innerHTML = new Date(element.innerHTML.trim()).toISOString().slice(0, 19).replace("T", " ") + " UTC"
      $[if `process.env.DATE_FORMAT === "relative"`]$
      element.innerHTML = getRelativeTimeString(new Date(element.innerHTML.trim())${{`process.env.DATE_FORMAT_RELATIVE_LANG ? ",'"+process.env.DATE_FORMAT_RELATIVE_LANG+"'" : ""`}}$)
      $[else]$
      element.innerHTML = new Date(element.innerHTML.trim()).toLocaleString()
      $[end]$
    })
  </script>
  $[if `process.env.ICONS !== "false"`]$
  <script data-turbo-eval="false" src="https://cdn.jsdelivr.net/npm/file-icons-js@1/dist/file-icons.min.js"></script>
  <script>
    var icons = window.FileIcons;
    document.querySelectorAll(".file-icon-placeholder").forEach(function(element) {
      element.classList = ("icon " + icons.getClassWithColor(element.getAttribute("filename"))).replace("null","binary-icon")
      element.innerHTML = ""
    })
  </script>
  $[end]$
  <script data-turbo-eval="false">    
    const getPreferredTheme = () => {
      if (localStorage.getItem('theme')) {
        return localStorage.getItem('theme')
      }
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }

    const setTheme = (theme) => {
      if (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.setAttribute('data-bs-theme', 'dark')
      } else {
        document.documentElement.setAttribute('data-bs-theme', theme);
      }
    }

    setTheme(getPreferredTheme())

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (storedTheme !== 'light' || storedTheme !== 'dark') {
        setTheme(getPreferredTheme())
      }
    })

    function toggletheme() {
      const theme = getPreferredTheme() === 'dark' ? 'light' : 'dark'
      console.log("click set to " + theme);
      document.querySelector("[data-bs-theme]").setAttribute('data-bs-theme', theme)
      localStorage.setItem('theme', theme)
      setTheme(theme)
    }

    // TODO: sorting
  </script>
  <script data-turbo-eval="false">
    const search = () => {
      const search = document.querySelector('#search').value.toLowerCase();
      const items = Array.from(document.querySelectorAll('.db-file'));
      items.forEach((item) => {
        const name = item.getAttribute('data-file-name').toLowerCase();
        if (name.includes(search)) {
          item.classList.remove('d-none');
        } else {
          item.classList.add('d-none');
        }
      });
    };
    const toggleSearch = () => {
      const search = document.querySelector('#search-container');
      search.classList.toggle('d-none');
      if (!search.classList.contains('d-none')) {
        document.querySelector('#search').focus();
      }
    };

    const sortElements = (key, elems) => elems.sort((a, b) => {
      const aVal = a.getAttribute(`data-file-${key}`);
      const bVal = b.getAttribute(`data-file-${key}`);
      if (key === 'name') {
        return aVal.localeCompare(bVal);
      } else if (key === 'dl') {
        return parseInt(aVal) - parseInt(bVal);
      } else if (key === 'size') {
        return parseInt(aVal) - parseInt(bVal);
      } else if (key === 'mod') {
        return aVal.localeCompare(bVal);
      }
    });
    const sort = (key, reverse) => {
      const items = Array.from(document.querySelectorAll('.db-file'));
      // seperate sort for folders (is_dir) and files
      const folders = sortElements(key, items.filter((item) => item.getAttribute('data-file-isdir') === '1'));
      const files = sortElements(key, items.filter((item) => item.getAttribute('data-file-isdir') === '0'));
      if (reverse) {
        folders.reverse();
        files.reverse();
      }
      // move .. folder top first position
      const parentFolder = folders.find((item) => item.getAttribute('data-file-name') === '..');
      if (parentFolder) {
        folders.splice(folders.indexOf(parentFolder), 1);
        folders.unshift(parentFolder);
      }
      const sorted = [...folders, ...files];
      items.forEach((item) => item.remove());
      sorted.forEach((item) => document.querySelector('#filetree').appendChild(item));
    };
    $[ifeq env:LAYOUT popup]$
      const setFileinfo = (data) => {
        document.querySelector('#file-popup .modal-title').innerText = data.name;
        document.querySelector("#file-info-url-api").href = data.url + "?info";
        document.querySelector("#file-info-url").href = data.url;
        document.querySelector('#file-popup').classList.add("d-block");
      }
    $[end]$
  </script>
  <script>
    $[ifeq env:LAYOUT popup]$
    document.querySelectorAll('.db-file').forEach((item) => {
      // skip folders
      if (item.getAttribute('data-file-isdir') === '1') {
        return;
      }
      item.addEventListener('click', async (e) => {
        e.preventDefault();

        // only do this on reload click button refreshFileinfo()
        // const data = await fetch(item.href + "?info").then((res) => res.json());
        // alert(JSON.stringify(data, null, 2));

        setFileinfo({
          name: item.getAttribute('data-file-name'),
          url: item.href
        });
        document.querySelector('#file-popup').classList.add("d-block");
      })
    });
    document.querySelector('#file-popup').addEventListener('click', (e) => {
      if (e.target === document.querySelector('#file-popup')) {
        document.querySelector('#file-popup').classList.remove("d-block");
      }
    });
    document.querySelector('#file-popup-x').addEventListener('click', (e) => {
      document.querySelector('#file-popup').classList.remove("d-block");
    });
    $[end]$

    document.querySelector('#search').addEventListener('input', search);

    document.querySelector('#name').addEventListener('click', (e) => {
      e.preventDefault();
      sessionStorage.setItem("sort:order:name", sessionStorage.getItem("sort:order:name") === "asc" ? "desc" : "asc");
      sort('name', sessionStorage.getItem("sort:order:name") === "desc");
    });

    $[if `!process.env.NO_DL_COUNT`]$
    document.querySelector('#dl').addEventListener('click', (e) => {
      e.preventDefault();
      sessionStorage.setItem("sort:order:dl", sessionStorage.getItem("sort:order:dl") === "asc" ? "desc" : "asc");
      sort('dl', sessionStorage.getItem("sort:order:dl") === "desc");
    });
    $[end]$

    document.querySelector('#size').addEventListener('click', (e) => {
      e.preventDefault();
      sessionStorage.setItem("sort:order:size", sessionStorage.getItem("sort:order:size") === "asc" ? "desc" : "asc");
      sort('size', sessionStorage.getItem("sort:order:size") === "desc");
    });

    document.querySelector('#mod').addEventListener('click', (e) => {
      e.preventDefault();
      sessionStorage.setItem("sort:order:mod", sessionStorage.getItem("sort:order:mod") === "asc" ? "desc" : "asc");
      sort('mod', sessionStorage.getItem("sort:order:mod") === "desc");
    });
  </script>
</body>

</html>