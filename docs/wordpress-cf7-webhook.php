<?php
/**
 * Plugin Name: Samara ERP Tracking
 * Description: Page-view tracker, Contact Form 7 → ERP, WhatsApp-tap relay → ERP. Secrets live in wp-config.php.
 * Version:     2026.11.24.1
 *
 * Samara ERP — website tracking + Contact Form 7 → ERP.
 *
 * FULL REPLACEMENT for the previous snippet — install the same file on every
 * site (samaraliveaboard.com, otiumyacht.com, mischiefvoyage.com).
 *
 * No secret reaches the browser any more: the page-view tracker beacons to this
 * site's own /wp-json/samara/v1/pv, and WordPress forwards it to the ERP with
 * the secret in a header. Form submissions are likewise sent by WordPress.
 *
 * Add to wp-config.php (above "That's all, stop editing!"):
 *   define('SAMARA_ERP_WEBHOOK_SECRET',  '<Website Form Webhook Secret>');      // lead secret — server only
 *   define('SAMARA_ERP_PAGEVIEW_SECRET', '<Website Pageview Tracker Secret>');  // server only too
 * The two values MUST be different.
 */

if (!defined('ABSPATH')) exit; // only ever runs inside WordPress

const SAMARA_ERP_BASE   = 'https://erp.samarayachting.com/api/webhooks';
const SAMARA_ERP_TENANT = 'samara';
const SAMARA_TOUCH_KEYS = array('utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid');

// ── 1. Browser: page-view beacon (to this site) + first-touch cookies — no secret here ──
add_action('wp_footer', function () {
    if (!defined('SAMARA_ERP_PAGEVIEW_SECRET')) return;
    ?>
    <script>
    (function () {
      var PAGEVIEW_ENDPOINT = <?php echo wp_json_encode(rest_url('samara/v1/pv')); ?>;
      var FT_KEYS = <?php echo wp_json_encode(SAMARA_TOUCH_KEYS); ?>;

      function getCookie(name) {
        var m = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
        return m ? decodeURIComponent(m[2]) : '';
      }
      function setCookie(name, value, days) {
        var d = new Date();
        d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
        document.cookie = name + '=' + encodeURIComponent(value) + ';expires=' + d.toUTCString() + ';path=/;SameSite=Lax';
      }
      function uuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
          var r = (Math.random() * 16) | 0, v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
      }

      var visitorId = getCookie('samara_vid');
      if (!visitorId) {
        visitorId = uuid();
        setCookie('samara_vid', visitorId, 730);
      }

      var params = new URLSearchParams(window.location.search);
      // First touch (marketing audit 2026-11-24): everything from the SAME first visit — its
      // utm/click ids, landing page, referrer and time — captured once, never overwritten.
      if (!getCookie('samara_ft_captured')) {
        FT_KEYS.forEach(function (key) {
          var val = params.get(key);
          if (val) setCookie('samara_ft_' + key, val, 90);
        });
        setCookie('samara_ft_landing_url', window.location.href.slice(0, 1500), 90);
        if (document.referrer) setCookie('samara_ft_referrer', document.referrer.slice(0, 1000), 90);
        setCookie('samara_ft_ts', new Date().toISOString(), 90);
        setCookie('samara_ft_captured', '1', 90);
      }

      var beaconUrl = PAGEVIEW_ENDPOINT;
      var payload = {
        visitorId: visitorId,
        url: window.location.href,
        referrer: document.referrer || '',
        title: document.title || '',
        occurredAt: new Date().toISOString()
      };
      if (navigator.sendBeacon) {
        navigator.sendBeacon(beaconUrl, new Blob([JSON.stringify(payload)], { type: 'application/json' }));
      } else {
        fetch(beaconUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), keepalive: true });
      }
    })();
    </script>
    <?php
});

// ── 2. Server: forward each page view to the ERP ──
add_action('rest_api_init', function () {
    register_rest_route('samara/v1', '/pv', array(
        'methods'             => 'POST',
        'permission_callback' => '__return_true', // public beacon; the checks below + ERP rate limit guard it
        'callback'            => function (WP_REST_Request $request) {
            if (!defined('SAMARA_ERP_PAGEVIEW_SECRET')) return new WP_REST_Response(null, 204);

            $body       = $request->get_json_params();
            $visitor_id = isset($body['visitorId']) ? (string) $body['visitorId'] : '';
            $url        = isset($body['url']) ? (string) $body['url'] : '';
            $site_host  = strtolower((string) wp_parse_url(home_url(), PHP_URL_HOST));

            // Only this site's own pages, sent from this site — drops other sites and junk
            // before it costs an ERP call. (Origin/Referer can be forged by a script; the
            // ERP's per-visitor-IP rate limit is what caps that.)
            $same_site = function ($u) use ($site_host) {
                $h = strtolower((string) wp_parse_url((string) $u, PHP_URL_HOST));
                return $h !== '' && ($h === $site_host || substr($h, -strlen('.' . $site_host)) === '.' . $site_host);
            };
            $origin = $request->get_header('origin') ?: $request->get_header('referer');
            if (!preg_match('/^[A-Za-z0-9_-]{8,64}$/', $visitor_id)
                || strlen($url) > 2000 || !$same_site($url)
                || ($origin && !$same_site($origin))) {
                return new WP_REST_Response(null, 400);
            }

            wp_remote_post(SAMARA_ERP_BASE . '/pageview?tenant=' . SAMARA_ERP_TENANT, array(
                'timeout'  => 5,
                'blocking' => false, // don't hold the PHP worker on the ERP
                'headers'  => array(
                    'Content-Type'     => 'application/json',
                    'X-Webhook-Secret' => SAMARA_ERP_PAGEVIEW_SECRET,
                ),
                'body'     => wp_json_encode(array(
                    'visitorId'  => $visitor_id,
                    'url'        => $url,
                    'referrer'   => isset($body['referrer']) ? substr((string) $body['referrer'], 0, 2000) : '',
                    'title'      => isset($body['title']) ? substr(sanitize_text_field((string) $body['title']), 0, 300) : '',
                    'occurredAt' => isset($body['occurredAt']) ? (string) $body['occurredAt'] : '',
                    // Same source CF7 uses for its remote_ip.
                    'visitor_ip' => isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '',
                )),
            ));
            return new WP_REST_Response(null, 204);
        },
    ));
});

// ── 3. Server: forward each successful CF7 submission to the ERP ──
add_action('wpcf7_mail_sent', function ($contact_form) {
    if (!defined('SAMARA_ERP_WEBHOOK_SECRET')) return;

    $submission = WPCF7_Submission::get_instance();
    if (!$submission) return;

    $data = array();
    foreach ($submission->get_posted_data() as $key => $value) {
        $data[$key] = is_array($value) ? implode(', ', $value) : (string) $value;
    }

    // CF7 form ID — the ERP ignores forms that are never a lead (newsletter 90693, handover §2).
    $data['form_id'] = (string) $contact_form->id();

    // Page the form was submitted from (incl. its ?utm_… query string).
    $page_url = (string) $submission->get_meta('url');
    $data['page-url']   = $page_url;
    $data['visitor_ip'] = samara_erp_visitor_ip() ?: (string) $submission->get_meta('remote_ip');
    // The CF7 submit is the visitor's own browser request, so this is their User-Agent.
    $data['user_agent'] = isset($_SERVER['HTTP_USER_AGENT']) ? substr(sanitize_text_field(wp_unslash($_SERVER['HTTP_USER_AGENT'])), 0, 1000) : '';

    $cookie = function ($name) {
        return isset($_COOKIE[$name]) ? sanitize_text_field(wp_unslash($_COOKIE[$name])) : '';
    };
    $data['visitorId'] = $cookie('samara_vid');

    // Meta cookies, read server-side like the old deal maker did (snippet 92) — unless the form
    // already carries them. On a consent denial in the EU/UK/CH or with no region, every spelling
    // of them is removed instead (handover §2).
    if (samara_erp_meta_blocked($data)) {
        $data = samara_erp_strip_meta_cookies($data);
    } else {
        foreach (array('_fbp', '_fbc') as $meta_cookie) {
            if (empty($data[$meta_cookie]) || $data[$meta_cookie] === 'undefined') $data[$meta_cookie] = $cookie($meta_cookie);
        }
    }

    // Current touch: this page's query string when it has the key; otherwise keep what the form's
    // own hidden field carries — snippet 62 fills it from the URL OR its first-party cookies
    // (handover §2), so a click ID picked up on an earlier page must not be blanked here.
    // First touch: the samara_ft_* cookie when set, else the form's own ft_* field.
    $query = array();
    parse_str((string) wp_parse_url($page_url, PHP_URL_QUERY), $query);
    foreach (SAMARA_TOUCH_KEYS as $key) {
        if (isset($query[$key]) && trim((string) $query[$key]) !== '') {
            $data[$key] = sanitize_text_field($query[$key]);
        } elseif (!isset($data[$key]) || in_array(strtolower(trim($data[$key])), array('undefined', 'null'), true)) {
            $data[$key] = '';
        }
        $ft = $cookie('samara_ft_' . $key);
        if ($ft !== '') $data['ft_' . $key] = $ft;
    }
    // The rest of the same first visit: landing page, referrer, time (ERP: Inquiry.firstLandingUrl /
    // firstReferrer / firstTouchAt). A visitor captured before 2026.11.24.1 has no samara_ft_ts — the
    // ERP then falls back to this visit for the whole first touch.
    foreach (array('landing_url', 'referrer', 'ts') as $ft_key) {
        $ft = $cookie('samara_ft_' . $ft_key);
        if ($ft !== '') $data['ft_' . $ft_key] = $ft;
    }

    wp_remote_post(SAMARA_ERP_BASE . '/cf7?tenant=' . SAMARA_ERP_TENANT, array(
        'timeout'  => 10,
        'blocking' => false, // don't make the visitor wait on the ERP
        'headers'  => array(
            'Content-Type'     => 'application/json',
            'X-Webhook-Secret' => SAMARA_ERP_WEBHOOK_SECRET,
        ),
        'body'     => wp_json_encode($data),
    ));
});

// True when Meta's cookies must not be read or sent: ad consent denied in the EU/UK/CH or with no
// region (handover §2; same rule as the ERP's dropMetaCookies). Forms say ad_consent /
// consent_region; snippet 63 taps may also say consent / region ($is_tap).
function samara_erp_meta_blocked($data, $is_tap = false) {
    $pick = function ($keys) use ($data) {
        foreach ($keys as $k) if (isset($data[$k]) && trim((string) $data[$k]) !== '') return strtolower(trim((string) $data[$k]));
        return '';
    };
    $consent = $pick($is_tap ? array('ad_consent', 'consent') : array('ad_consent'));
    $region  = $pick($is_tap ? array('consent_region', 'region') : array('consent_region'));
    return $consent === 'denied' && in_array($region, array('', 'none', 'eu', 'eea', 'uk', 'ch'), true);
}

// Every spelling of _fbc / _fbp (_fbc, fbc, meta_fbc, ft_fbc …) removed — not fbclid.
function samara_erp_strip_meta_cookies($data) {
    foreach (array_keys($data) as $k) {
        if (preg_match('/^(ft_)?_?(meta_)?fb[cp]$/i', (string) $k)) unset($data[$k]);
    }
    return $data;
}

// Visitor IP behind Cloudflare (CF-Connecting-IP), else REMOTE_ADDR — same as the old deal maker.
function samara_erp_visitor_ip() {
    foreach (array('HTTP_CF_CONNECTING_IP', 'REMOTE_ADDR') as $key) {
        if (!empty($_SERVER[$key])) {
            $ip = trim((string) $_SERVER[$key]);
            if (filter_var($ip, FILTER_VALIDATE_IP)) return $ip;
        }
    }
    return '';
}

// ── 4. Server: relay each WhatsApp-button tap to the ERP ──
// Snippet 63 logs every tap on the WhatsApp button (ref "SL-XXXXX", click IDs, UTMs, consent…)
// through this site's POST /wp-json/gb/v1/wa-tap. After that endpoint succeeds, the same tap is
// forwarded to the ERP so it can match the WhatsApp chat back to the click (ERP src/lib/wa-tap.ts).
// No change to snippet 63 needed.
add_filter('rest_post_dispatch', function ($response, $server, $request) {
    if (!defined('SAMARA_ERP_WEBHOOK_SECRET')) return $response;
    if (!($request instanceof WP_REST_Request) || $request->get_route() !== '/gb/v1/wa-tap') return $response;
    if (is_wp_error($response) || $response->get_status() >= 300) return $response;

    $tap = $request->get_json_params();
    if (!is_array($tap) || !$tap) $tap = $request->get_body_params();
    if (!is_array($tap) || !$tap) return $response;
    // Values the tap endpoint itself may have added (e.g. the generated ref).
    $resp_data = $response->get_data();
    if (is_array($resp_data)) {
        foreach (array('ref', 'code', 'tapped_at', 'created_at') as $k) {
            if (empty($tap[$k]) && !empty($resp_data[$k])) $tap[$k] = $resp_data[$k];
        }
    }
    // Snippet 63 logs _fbc/_fbp with the tap; on a denial they must not leave the site (handover §2).
    if (samara_erp_meta_blocked($tap, true)) $tap = samara_erp_strip_meta_cookies($tap);
    $tap['ip'] = samara_erp_visitor_ip();
    $tap['ua'] = isset($_SERVER['HTTP_USER_AGENT']) ? substr(sanitize_text_field(wp_unslash($_SERVER['HTTP_USER_AGENT'])), 0, 1000) : '';
    if (empty($tap['tapped_at'])) $tap['tapped_at'] = gmdate('c');

    wp_remote_post(SAMARA_ERP_BASE . '/wa-tap?tenant=' . SAMARA_ERP_TENANT, array(
        'timeout'  => 5,
        'blocking' => false,
        'headers'  => array(
            'Content-Type'     => 'application/json',
            'X-Webhook-Secret' => SAMARA_ERP_WEBHOOK_SECRET,
        ),
        'body'     => wp_json_encode($tap),
    ));
    return $response;
}, 10, 3);
