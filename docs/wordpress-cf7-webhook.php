<?php
/**
 * Samara ERP — send Contact Form 7 submissions to the ERP server-to-server.
 *
 * Replaces the old browser-side `wpcf7mailsent` fetch() that had the secret
 * visible in page source. Install via the "Code Snippets" plugin (Run
 * everywhere) or the child theme's functions.php.
 *
 * 1. Add to wp-config.php (above "That's all, stop editing!"):
 *      define('SAMARA_ERP_WEBHOOK_SECRET', '<new Website Form Webhook Secret>');
 * 2. Activate this snippet.
 * 3. Remove the old JS that POSTs to /api/webhooks/cf7 on wpcf7mailsent.
 *    (Keep the page-view tracker JS, but switch its ?secret= to the new
 *    Website Pageview Tracker Secret.)
 */

add_action('wpcf7_mail_sent', function ($contact_form) {
    if (!defined('SAMARA_ERP_WEBHOOK_SECRET')) return;

    $submission = WPCF7_Submission::get_instance();
    if (!$submission) return;

    // Form fields (incl. hidden ft_* / utm_* / gclid / fbclid fields).
    $data = array();
    foreach ($submission->get_posted_data() as $key => $value) {
        $data[$key] = is_array($value) ? implode(', ', $value) : (string) $value;
    }

    // Things the browser used to send that the server must now supply.
    $data['page-url']   = (string) $submission->get_meta('url');
    $data['visitor_ip'] = (string) $submission->get_meta('remote_ip');
    if (empty($data['visitorId']) && !empty($_COOKIE['visitorId'])) {
        $data['visitorId'] = sanitize_text_field(wp_unslash($_COOKIE['visitorId']));
    }

    wp_remote_post('https://erp.samarayachting.com/api/webhooks/cf7?tenant=samara', array(
        'timeout'  => 10,
        'blocking' => false, // don't make the visitor wait on the ERP
        'headers'  => array(
            'Content-Type'     => 'application/json',
            'X-Webhook-Secret' => SAMARA_ERP_WEBHOOK_SECRET,
        ),
        'body'     => wp_json_encode($data),
    ));
});
