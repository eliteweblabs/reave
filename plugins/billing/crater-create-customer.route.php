<?php
/**
 * Paste into eliteweblabs/crater → routes/api-custom.php
 * (after GET /api/custom/customers and PUT /api/custom/customer/{id}).
 *
 * reave.app calls POST /api/custom/create-customer when a contact is pushed
 * from the admin Clients panel (or via push_contact_to_crater agent tool).
 */

use Crater\Models\Company;
use Crater\Models\Customer;
use Crater\Models\CompanySetting;

Route::post('/custom/create-customer', function (Illuminate\Http\Request $request) {
    if ($request->header('X-Crater-Api-Token') !== env('CRATER_API_TOKEN')) {
        return response()->json(['error' => 'Unauthorized'], 401);
    }

    $validated = $request->validate([
        'name' => 'required|string|max:255',
        'contact_name' => 'nullable|string|max:255',
        'email' => 'nullable|string|max:255',
        'phone' => 'nullable|string|max:255',
    ]);

    $company = Company::query()->orderBy('id')->first();
    if (!$company) {
        return response()->json(['error' => 'No company configured in Crater'], 422);
    }

    $companyId = $company->id;
    $currencyId = CompanySetting::getSetting('currency', $companyId);
    if (!$currencyId) {
        return response()->json(['error' => 'Company currency is not configured'], 422);
    }

    $email = trim((string) ($validated['email'] ?? ''));
    if ($email !== '') {
        $existing = Customer::query()
            ->where('company_id', $companyId)
            ->whereRaw('LOWER(email) = ?', [strtolower($email)])
            ->first();
        if ($existing) {
            return response()->json([
                'success' => false,
                'error' => 'Customer with this email already exists',
                'customer_id' => $existing->id,
                'name' => $existing->name,
            ], 409);
        }
    }

    $displayName = trim($validated['name']);
    $contactName = trim((string) ($validated['contact_name'] ?? ''));
    if ($contactName === '') {
        $contactName = $displayName;
    }

    $customer = Customer::create([
        'name' => $displayName,
        'contact_name' => $contactName,
        'email' => $email !== '' ? $email : null,
        'phone' => trim((string) ($validated['phone'] ?? '')) ?: null,
        'company_id' => $companyId,
        'currency_id' => $currencyId,
        'creator_id' => 1,
    ]);

    return response()->json([
        'success' => true,
        'customer_id' => $customer->id,
        'name' => $customer->name,
        'contact_name' => $customer->contact_name,
        'email' => $customer->email,
        'phone' => $customer->phone,
        'admin_url' => url('/admin/customers/' . $customer->id . '/edit'),
    ]);
});
