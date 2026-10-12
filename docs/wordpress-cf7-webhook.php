<?php
/**
 * Samara ERP — website tracking + Contact Form 7 → ERP.
 *
 * FULL REPLACEMENT for the old snippet (the one with `$secret = '...'` in
 * wp_footer). The page-view tracker stays in the browser; the form submission
 * is now sent by the WordPress server, so the lead secret never reaches the
 * browser.
 *
 * Add to wp-config.php (above "That's all, stop editing!"):
 *   define('SAMARA_ERP_WEBHOOK_SECRET',  '<Website Form Webhook Secret>');      // lead secret — server only
 *   define('SAMARA_ERP_PAGEVIEW_SECRET', '<Website Pageview Tracker Secret>');  // visible in page source, low value
 * The two values MUST be different.
 */

const SAMARA_ERP_BASE   = 'https://erp.samarayachting.com/api/webhooks';
const SAMARA_ERP_TENANT = 'samara';
const SAMARA_TOUCH_KEYS = array('utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'gbraid', 'wbraid', 'fbclid');

// ── 1. Browser: page-view tracker + first-touch cookies (no lead secret here) ──
add_action('wp_footer', function () {
    if (!defined('SAMARA_ERP_PAGEVIEW_SECRET')) return;
    ?>
    <script>
    (function () {
      var PAGEVIEW_ENDPOINT = <?php echo wp_json_encode(SAMARA_ERP_BASE . '/pageview'); ?>;
      var TENANT = <?php echo wp_json_encode(SAMARA_ERP_TENANT); ?>;
      var SECRET = <?php echo wp_json_encode(SAMARA_ERP_PAGEVIEW_SECRET); ?>;
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
      if (!getCookie('samara_ft_captured')) {
        FT_KEYS.forEach(function (key) {
          var val = params.get(key);
          if (val) setCookie('samara_ft_' + key, val, 90);
        });
        setCookie('samara_ft_captured', '1', 90);
      }

      var beaconUrl = PAGEVIEW_ENDPOINT + '?tenant=' + encodeURIComponent(TENANT) + '&secret=' + encodeURIComponent(SECRET);
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

// ── 2. Server: forward each successful CF7 submission to the ERP ──
add_action('wpcf7_mail_sent', function ($contact_form) {
    if (!defined('SAMARA_ERP_WEBHOOK_SECRET')) return;

    $submission = WPCF7_Submission::get_instance();
    if (!$submission) return;

    $data = array();
    foreach ($submission->get_posted_data() as $key => $value) {
        $data[$key] = is_array($value) ? implode(', ', $value) : (string) $value;
    }

    // Page the form was submitted from (incl. its ?utm_… query string).
    $page_url = (string) $submission->get_meta('url');
    $data['page-url']   = $page_url;
    $data['visitor_ip'] = (string) $submission->get_meta('remote_ip');

    $cookie = function ($name) {
        return isset($_COOKIE[$name]) ? sanitize_text_field(wp_unslash($_COOKIE[$name])) : '';
    };
    $data['visitorId'] = $cookie('samara_vid');

    // Current touch = this page's query string; first touch = samara_ft_* cookies.
    $query = array();
    parse_str((string) wp_parse_url($page_url, PHP_URL_QUERY), $query);
    foreach (SAMARA_TOUCH_KEYS as $key) {
        $data[$key]         = isset($query[$key]) ? sanitize_text_field($query[$key]) : '';
        $data['ft_' . $key] = $cookie('samara_ft_' . $key);
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
