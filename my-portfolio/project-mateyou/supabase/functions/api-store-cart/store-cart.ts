import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, createSupabaseClient, errorResponse, successResponse, getAuthUser, parseRequestBody, getQueryParams } from '../_shared/utils.ts';

// 상품 타입 정의
interface CartProduct {
  product_id: string;
  name: string;
  price: number;
  product_type: 'digital' | 'delivery' | 'on_site';
  source: 'partner' | 'collaboration';
  stock: number | null;
  is_active: boolean;
  partner_id: string;
  parent_product_id: string | null;
  shipping_fee_base: number;
  shipping_fee_remote: number;
  is_bundle_available: boolean;
  purchase_count?: number;
}

interface CartItem {
  id: string;
  member_id: string;
  product_id: string;
  partner_id: string;
  quantity: number;
  product: CartProduct;
  selected_options?: Array<{
    option_id: string;
    option_name: string;
    option_type: string;
    value_id?: string;
    value?: string;
    text_value?: string;
    price_adjustment: number;
  }>;
}

// 배송 그룹 (묶음배송 단위)
interface ShipmentGroup {
  source: 'partner' | 'collaboration';
  is_bundled: boolean;
  items: CartItem[];
  max_shipping_fee: number;
  total_product_amount: number;
}

// 산간 지역 판단 함수 (우편번호 기반)
function isRemoteArea(postalCode: string | null | undefined): boolean {
  if (!postalCode) return false;
  const code = parseInt(postalCode.replace(/\D/g, ''), 10);
  if (isNaN(code)) return false;
  
  // 제주도: 63000-63644
  if (code >= 63000 && code <= 63644) return true;
  // 울릉도: 40200-40240
  if (code >= 40200 && code <= 40240) return true;
  
  return false;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const supabase = createSupabaseClient();
    const params = getQueryParams(req.url);

    // ===== GET /api-store-cart - 장바구니 목록 조회 =====
    if (pathname === '/api-store-cart' && req.method === 'GET') {
      const user = await getAuthUser(req);

      const { data, error } = await supabase
        .from('store_cart_items')
        .select(`
          *,
          product:store_products(
            product_id, name, description, price, product_type, source, thumbnail_url, 
            stock, is_active, shipping_fee_base, shipping_fee_remote, is_bundle_available,
            partner:partners(id, partner_name, member:members(id, name, profile_image)),
            options:store_product_options(option_id, name, option_type, is_required, display_order, values:store_product_option_values(value_id, value, price_adjustment, stock, display_order))
          )
        `)
        .eq('member_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // 장바구니 요약 정보 계산 (묶음배송 기준)
      let totalProductAmount = 0;
      let hasDeliveryProduct = false;
      let hasDigitalProduct = false;
      let partnerId: string | null = null;

      // 배송비 계산을 위한 그룹핑
      const partnerBundleItems: CartItem[] = [];
      const partnerNonBundleItems: CartItem[] = [];
      const collabBundleItems: CartItem[] = [];
      const collabNonBundleItems: CartItem[] = [];

      for (const item of (data || []) as CartItem[]) {
        const product = item.product;
        if (product && product.is_active) {
          totalProductAmount += product.price * item.quantity;
          if (product.product_type === 'delivery') {
            hasDeliveryProduct = true;
            // 묶음배송 그룹핑
            if (product.source === 'partner') {
              if (product.is_bundle_available) {
                partnerBundleItems.push(item);
              } else {
                partnerNonBundleItems.push(item);
              }
            } else {
              if (product.is_bundle_available) {
                collabBundleItems.push(item);
              } else {
                collabNonBundleItems.push(item);
              }
            }
          }
          if (product.product_type === 'digital') hasDigitalProduct = true;
          if (!partnerId) partnerId = item.partner_id;
        }
      }

      // 배송비 계산
      let totalShippingFee = 0;
      
      // 파트너 묶음 상품 → 최대 배송비만
      if (partnerBundleItems.length > 0) {
        const maxFee = Math.max(...partnerBundleItems.map(i => i.product.shipping_fee_base || 0));
        totalShippingFee += maxFee;
      }
      
      // 파트너 비묶음 상품 → 각각 배송비
      for (const item of partnerNonBundleItems) {
        totalShippingFee += item.product.shipping_fee_base || 0;
      }
      
      // 협업 묶음 상품 → 최대 배송비만
      if (collabBundleItems.length > 0) {
        const maxFee = Math.max(...collabBundleItems.map(i => i.product.shipping_fee_base || 0));
        totalShippingFee += maxFee;
      }
      
      // 협업 비묶음 상품 → 각각 배송비
      for (const item of collabNonBundleItems) {
        totalShippingFee += item.product.shipping_fee_base || 0;
      }

      return successResponse({
        items: data,
        summary: {
          total_items: data?.length || 0,
          total_product_amount: totalProductAmount,
          total_shipping_fee: totalShippingFee,
          total_amount: totalProductAmount + totalShippingFee,
          has_delivery_product: hasDeliveryProduct,
          has_digital_product: hasDigitalProduct,
          needs_shipping_address: hasDeliveryProduct,
          partner_id: partnerId,
          // 묶음배송 상세
          bundle_info: {
            partner_bundle_count: partnerBundleItems.length,
            partner_non_bundle_count: partnerNonBundleItems.length,
            collab_bundle_count: collabBundleItems.length,
            collab_non_bundle_count: collabNonBundleItems.length
          }
        }
      });
    }

    // ===== POST /api-store-cart - 장바구니에 상품 추가 =====
    if (pathname === '/api-store-cart' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body || !body.product_id) {
        return errorResponse('INVALID_REQUEST', 'product_id는 필수입니다.');
      }

      const { product_id, quantity = 1, selected_options } = body;

      // 상품 확인
      const { data: product, error: productError } = await supabase
        .from('store_products')
        .select('product_id, partner_id, product_type, stock, is_active, name, is_bundle_available')
        .eq('product_id', product_id)
        .single();

      if (productError || !product) {
        return errorResponse('NOT_FOUND', '상품을 찾을 수 없습니다.', null, 404);
      }

      // 비활성 상품 체크
      if (!product.is_active) {
        return errorResponse('INVALID_REQUEST', '판매 중지된 상품입니다.');
      }

      // 현장수령 상품(on_site)은 장바구니에 담을 수 없음
      if (product.product_type === 'on_site') {
        return errorResponse('INVALID_REQUEST', '현장수령 상품은 장바구니에 담을 수 없습니다. 바로 구매해 주세요.');
      }

      // 재고 확인 (택배수령 상품)
      if (product.product_type === 'delivery' && product.stock !== null) {
        if (product.stock < quantity) {
          return errorResponse('INVALID_REQUEST', `재고가 부족합니다. (현재 재고: ${product.stock}개)`);
        }
      }

      // ===== 옵션 검증 및 저장할 옵션 정보 준비 (delivery, on_site 상품) =====
      let validatedOptions: Array<{
        option_id: string;
        option_name: string;
        option_type: string;
        value_id?: string;
        value?: string;
        text_value?: string;
        price_adjustment: number;
      }> | null = null;

      // 상품에 옵션이 있는지 먼저 조회 (delivery, on_site 상품만)
      if (product.product_type === 'delivery' || product.product_type === 'on_site') {
        const { data: productOptions } = await supabase
          .from('store_product_options')
          .select('option_id, name, option_type, is_required')
          .eq('product_id', product_id)
          .order('display_order');

        if (productOptions && productOptions.length > 0) {
          // 필수 옵션이 있는 경우 selected_options 필수 체크
          const requiredOptions = productOptions.filter(opt => opt.is_required);
          if (requiredOptions.length > 0) {
            if (!selected_options || !Array.isArray(selected_options) || selected_options.length === 0) {
              return errorResponse('INVALID_REQUEST', '필수 옵션을 선택해주세요.');
            }
          }

          // selected_options가 전달된 경우에만 옵션 검증 수행
          if (selected_options && Array.isArray(selected_options)) {
            validatedOptions = [];
            
            // 필수 옵션 체크
            for (const reqOpt of requiredOptions) {
              const selectedOpt = selected_options.find((so: { option_id: string }) => so.option_id === reqOpt.option_id);
              if (!selectedOpt) {
                return errorResponse('INVALID_REQUEST', `필수 옵션 "${reqOpt.name}"을(를) 선택해주세요.`);
              }
              if (reqOpt.option_type === 'select' && !selectedOpt.value_id) {
                return errorResponse('INVALID_REQUEST', `필수 옵션 "${reqOpt.name}"의 값을 선택해주세요.`);
              }
            }

            // 선택된 옵션 검증
            for (const selOpt of selected_options as Array<{ option_id: string; value_id?: string; text_value?: string }>) {
              const productOption = productOptions.find(po => po.option_id === selOpt.option_id);
              if (!productOption) {
                return errorResponse('INVALID_REQUEST', `유효하지 않은 옵션입니다: ${selOpt.option_id}`);
              }

              if (productOption.option_type === 'select') {
                if (!selOpt.value_id) {
                  if (productOption.is_required) {
                    return errorResponse('INVALID_REQUEST', `옵션 "${productOption.name}"의 값을 선택해주세요.`);
                  }
                  continue;
                }

                const { data: optionValue } = await supabase
                  .from('store_product_option_values')
                  .select('value_id, value, price_adjustment')
                  .eq('value_id', selOpt.value_id)
                  .eq('option_id', selOpt.option_id)
                  .single();

                if (!optionValue) {
                  return errorResponse('INVALID_REQUEST', `유효하지 않은 옵션 값입니다: ${selOpt.value_id}`);
                }

                validatedOptions.push({
                  option_id: selOpt.option_id,
                  option_name: productOption.name,
                  option_type: 'select',
                  value_id: selOpt.value_id,
                  value: optionValue.value,
                  price_adjustment: optionValue.price_adjustment || 0
                });
              } else if (productOption.option_type === 'text') {
                validatedOptions.push({
                  option_id: selOpt.option_id,
                  option_name: productOption.name,
                  option_type: 'text',
                  text_value: selOpt.text_value || '',
                  price_adjustment: 0
                });
              }
            }
          }
        }
      }

      // 기존 장바구니 확인 (다른 파트너 상품이 있는지)
      const { data: existingCart } = await supabase
        .from('store_cart_items')
        .select('id, partner_id, product_id')
        .eq('member_id', user.id);

      // 다른 파트너의 상품이 있으면 기존 장바구니 전체 삭제
      if (existingCart && existingCart.length > 0) {
        const existingPartnerId = existingCart[0].partner_id;
        
        if (existingPartnerId !== product.partner_id) {
          // 다른 파트너 → 기존 장바구니 전체 삭제
          await supabase
            .from('store_cart_items')
            .delete()
            .eq('member_id', user.id);
        } else {
          // 같은 파트너 → 같은 상품이 이미 있는지 확인
          const existingItem = existingCart.find((item: { product_id: string }) => item.product_id === product_id);
          
          if (existingItem) {
            // 이미 있는 상품이면 수량만 업데이트
            const { data: cartItem, error: updateError } = await supabase
              .from('store_cart_items')
              .update({ quantity })
              .eq('id', existingItem.id)
              .select(`
                *,
                product:store_products(
                  product_id, name, price, product_type, thumbnail_url, stock, is_active, is_bundle_available,
                  partner:partners(id, partner_name)
                )
              `)
              .single();

            if (updateError) throw updateError;

            return successResponse({
              ...cartItem,
              message: '장바구니 상품 수량이 업데이트되었습니다.'
            });
          }
        }
      }

      // 장바구니에 새 상품 추가
      const cartInsertData: Record<string, unknown> = {
        member_id: user.id,
        product_id,
        partner_id: product.partner_id,
        quantity
      };

      // 옵션 정보가 있으면 저장
      if (validatedOptions && validatedOptions.length > 0) {
        cartInsertData.selected_options = validatedOptions;
      }

      const { data: cartItem, error: insertError } = await supabase
        .from('store_cart_items')
        .insert(cartInsertData)
        .select(`
          *,
          product:store_products(
            product_id, name, price, product_type, thumbnail_url, stock, is_active, is_bundle_available,
            partner:partners(id, partner_name)
          )
        `)
        .single();

      if (insertError) throw insertError;

      // 다른 파트너 상품이 있어서 삭제했는지 여부 포함
      const wasCleared = existingCart && existingCart.length > 0 && existingCart[0].partner_id !== product.partner_id;

      return successResponse({
        ...cartItem,
        cart_cleared: wasCleared,
        message: wasCleared 
          ? '다른 파트너의 상품이 있어 장바구니를 비우고 새 상품을 추가했습니다.'
          : '장바구니에 상품이 추가되었습니다.'
      });
    }

    // ===== PUT /api-store-cart/:id - 장바구니 상품 수량 변경 =====
    const cartUpdateMatch = pathname.match(/^\/api-store-cart\/([a-f0-9-]+)$/);
    if (cartUpdateMatch && req.method === 'PUT') {
      const user = await getAuthUser(req);
      const cartItemId = cartUpdateMatch[1];
      const body = await parseRequestBody(req);

      if (!body || typeof body.quantity !== 'number') {
        return errorResponse('INVALID_REQUEST', 'quantity는 필수입니다.');
      }

      const { quantity } = body;

      if (quantity < 1) {
        return errorResponse('INVALID_REQUEST', '수량은 1개 이상이어야 합니다.');
      }

      // 장바구니 아이템 확인
      const { data: existingItem, error: checkError } = await supabase
        .from('store_cart_items')
        .select('id, member_id, product_id, product:store_products(stock, product_type)')
        .eq('id', cartItemId)
        .eq('member_id', user.id)
        .single();

      if (checkError || !existingItem) {
        return errorResponse('NOT_FOUND', '장바구니 아이템을 찾을 수 없습니다.', null, 404);
      }

      // 재고 확인 (택배수령 상품)
      // deno-lint-ignore no-explicit-any
      const productData = existingItem.product as any;
      const product = Array.isArray(productData) ? productData[0] : productData as { stock: number | null; product_type: string } | null;
      if (product?.product_type === 'delivery' && product?.stock !== null) {
        if (product.stock < quantity) {
          return errorResponse('INVALID_REQUEST', `재고가 부족합니다. (현재 재고: ${product.stock}개)`);
        }
      }

      // 수량 업데이트
      const { data: updatedItem, error: updateError } = await supabase
        .from('store_cart_items')
        .update({ quantity })
        .eq('id', cartItemId)
        .select(`
          *,
          product:store_products(
            product_id, name, price, product_type, thumbnail_url, stock, is_active, is_bundle_available,
            partner:partners(id, partner_name)
          )
        `)
        .single();

      if (updateError) throw updateError;

      return successResponse(updatedItem);
    }

    // ===== DELETE /api-store-cart/:id - 장바구니에서 특정 상품 삭제 =====
    const cartDeleteMatch = pathname.match(/^\/api-store-cart\/([a-f0-9-]+)$/);
    if (cartDeleteMatch && req.method === 'DELETE') {
      const user = await getAuthUser(req);
      const cartItemId = cartDeleteMatch[1];

      const { error: deleteError } = await supabase
        .from('store_cart_items')
        .delete()
        .eq('id', cartItemId)
        .eq('member_id', user.id);

      if (deleteError) throw deleteError;

      return successResponse({ message: '장바구니에서 상품이 삭제되었습니다.' });
    }

    // ===== DELETE /api-store-cart - 장바구니 비우기 =====
    if (pathname === '/api-store-cart' && req.method === 'DELETE') {
      const user = await getAuthUser(req);

      const { error: deleteError } = await supabase
        .from('store_cart_items')
        .delete()
        .eq('member_id', user.id);

      if (deleteError) throw deleteError;

      return successResponse({ message: '장바구니가 비워졌습니다.' });
    }

    // ===== POST /api-store-cart/checkout - 장바구니 일괄 주문 (정규화된 구조) =====
    if (pathname === '/api-store-cart/checkout' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      // 배송지 정보 (택배수령 상품이 있는 경우 필수)
      const {
        shipping_address_id,
        recipient_name,
        recipient_phone,
        recipient_address,
        recipient_address_detail,
        recipient_postal_code,
        delivery_memo,
        save_shipping_address = false,
        set_as_default = false
      } = body || {};

      // 장바구니 조회 (is_bundle_available, selected_options, options 포함)
      const { data: cartItems, error: cartError } = await supabase
        .from('store_cart_items')
        .select(`
          *,
          product:store_products(
            product_id, name, price, product_type, source, stock, is_active,
            partner_id, parent_product_id, shipping_fee_base, shipping_fee_remote,
            is_bundle_available, purchase_count,
            options:store_product_options(option_id, name, option_type, is_required)
          )
        `)
        .eq('member_id', user.id);

      if (cartError) throw cartError;

      if (!cartItems || cartItems.length === 0) {
        return errorResponse('INVALID_REQUEST', '장바구니가 비어있습니다.');
      }

      // ===== 필수 옵션 검증 =====
      for (const item of cartItems as CartItem[]) {
        const product = item.product as CartProduct & { options?: Array<{ option_id: string; name: string; option_type: string; is_required: boolean }> };
        if (!product || !product.is_active) continue;

        // delivery, on_site 상품에 대해 필수 옵션 검증
        if (product.product_type !== 'digital' && product.options && product.options.length > 0) {
          const requiredOptions = product.options.filter(opt => opt.is_required);
          const selectedOptions = item.selected_options || [];

          for (const reqOpt of requiredOptions) {
            const selected = selectedOptions.find(so => so.option_id === reqOpt.option_id);
            if (!selected || (reqOpt.option_type === 'select' && !selected.value_id)) {
              return errorResponse('INVALID_REQUEST', `"${product.name}" 상품의 필수 옵션 "${reqOpt.name}"을(를) 선택해주세요.`);
            }
          }
        }
      }

      // 상품 유효성 검사 및 분류
      const digitalItems: CartItem[] = [];
      const partnerBundleItems: CartItem[] = [];
      const partnerNonBundleItems: CartItem[] = [];
      const collabBundleItems: CartItem[] = [];
      const collabNonBundleItems: CartItem[] = [];

      let hasDeliveryProduct = false;

      for (const item of cartItems as CartItem[]) {
        const product = item.product;
        
        if (!product || !product.is_active) {
          continue;
        }

        // 재고 확인
        if (product.product_type === 'delivery' && product.stock !== null) {
          if (product.stock < item.quantity) {
            return errorResponse('INVALID_REQUEST', `${product.name} 상품의 재고가 부족합니다. (재고: ${product.stock}개)`);
          }
        }

        // 상품 분류
        if (product.product_type === 'digital') {
          digitalItems.push(item);
        } else if (product.product_type === 'delivery') {
          hasDeliveryProduct = true;
          if (product.source === 'partner') {
            if (product.is_bundle_available) {
              partnerBundleItems.push(item);
            } else {
              partnerNonBundleItems.push(item);
            }
          } else {
            // collaboration
            if (product.is_bundle_available) {
              collabBundleItems.push(item);
            } else {
              collabNonBundleItems.push(item);
            }
          }
        }
      }

      const allValidItems = [...digitalItems, ...partnerBundleItems, ...partnerNonBundleItems, ...collabBundleItems, ...collabNonBundleItems];

      if (allValidItems.length === 0) {
        return errorResponse('INVALID_REQUEST', '주문 가능한 상품이 없습니다.');
      }

      // 택배수령 상품이 있는 경우 배송지 정보 확인
      let shippingInfo: {
        recipient_name: string;
        recipient_phone: string;
        recipient_address: string;
        recipient_address_detail?: string;
        recipient_postal_code: string;
        delivery_memo?: string;
      } | null = null;

      if (hasDeliveryProduct) {
        if (shipping_address_id) {
          const { data: savedAddress, error: addressError } = await supabase
            .from('member_shipping_addresses')
            .select('*')
            .eq('id', shipping_address_id)
            .eq('member_id', user.id)
            .single();

          if (addressError || !savedAddress) {
            return errorResponse('NOT_FOUND', '저장된 배송지를 찾을 수 없습니다.', null, 404);
          }

          shippingInfo = {
            recipient_name: savedAddress.name,
            recipient_phone: savedAddress.phone,
            recipient_address: savedAddress.address,
            recipient_address_detail: savedAddress.address_detail,
            recipient_postal_code: savedAddress.postal_code,
            delivery_memo: delivery_memo
          };
        } else {
          if (!recipient_name || !recipient_phone || !recipient_address || !recipient_postal_code) {
            return errorResponse('INVALID_REQUEST', '택배수령 상품이 포함되어 있어 배송지 정보가 필요합니다.');
          }

          shippingInfo = {
            recipient_name,
            recipient_phone,
            recipient_address,
            recipient_address_detail,
            recipient_postal_code,
            delivery_memo
          };

          if (save_shipping_address) {
            await supabase
              .from('member_shipping_addresses')
              .insert({
                member_id: user.id,
                name: recipient_name,
                phone: recipient_phone,
                address: recipient_address,
                address_detail: recipient_address_detail || null,
                postal_code: recipient_postal_code,
                is_default: set_as_default
              });
          }
        }
      }

      // ===== 배송비 계산 (산간 지역 추가 배송비 포함) =====
      let totalShippingFee = 0;
      
      // 산간 지역 여부 판단 (배송지 우편번호 기준)
      const isRemote = shippingInfo ? isRemoteArea(shippingInfo.recipient_postal_code) : false;
      
      // 상품별 총 배송비 계산 함수 (기본 + 산간)
      const getShippingFee = (item: CartItem) => {
        const baseFee = item.product.shipping_fee_base || 0;
        const remoteFee = isRemote ? (item.product.shipping_fee_remote || 0) : 0;
        return baseFee + remoteFee;
      };
      
      // 파트너 묶음 상품 → 최대 배송비 (기본+산간 합산 기준)
      const partnerBundleShippingFee = partnerBundleItems.length > 0
        ? Math.max(...partnerBundleItems.map(i => getShippingFee(i)))
        : 0;
      totalShippingFee += partnerBundleShippingFee;
      
      // 파트너 비묶음 상품 → 각각 배송비
      const partnerNonBundleShippingFees = partnerNonBundleItems.map(i => getShippingFee(i));
      totalShippingFee += partnerNonBundleShippingFees.reduce((a, b) => a + b, 0);
      
      // 협업 묶음 상품 → 최대 배송비 (기본+산간 합산 기준)
      const collabBundleShippingFee = collabBundleItems.length > 0
        ? Math.max(...collabBundleItems.map(i => getShippingFee(i)))
        : 0;
      totalShippingFee += collabBundleShippingFee;
      
      // 협업 비묶음 상품 → 각각 배송비
      const collabNonBundleShippingFees = collabNonBundleItems.map(i => getShippingFee(i));
      totalShippingFee += collabNonBundleShippingFees.reduce((a, b) => a + b, 0);

      // ===== 총 금액 계산 (옵션 가격 포함) =====
      const totalProductAmount = allValidItems.reduce((sum, item) => {
        const baseAmount = item.product.price * item.quantity;
        // 옵션 추가 금액 계산 (select 타입만 가격 조정 있음)
        const optionsAmount = (item.selected_options || [])
          .filter(opt => opt.option_type === 'select')
          .reduce((optSum, opt) => optSum + (opt.price_adjustment || 0) * item.quantity, 0);
        return sum + baseAmount + optionsAmount;
      }, 0);
      const totalAmount = totalProductAmount + totalShippingFee;

      // 유저 포인트 확인
      const { data: member, error: memberError } = await supabase
        .from('members')
        .select('id, total_points')
        .eq('id', user.id)
        .single();

      if (memberError || !member) {
        return errorResponse('NOT_FOUND', '회원 정보를 찾을 수 없습니다.', null, 404);
      }

      const userPoints = member.total_points || 0;

      if (userPoints < totalAmount) {
        return errorResponse('INSUFFICIENT_POINTS', '포인트가 부족합니다.', {
          current_points: userPoints,
          required_points: totalAmount,
          shortage: totalAmount - userPoints
        });
      }

      // ===== 포인트 차감 =====
      const newPoints = userPoints - totalAmount;
      const { error: pointUpdateError } = await supabase
        .from('members')
        .update({ total_points: newPoints })
        .eq('id', user.id);

      if (pointUpdateError) throw pointUpdateError;

      const partnerId = allValidItems[0].partner_id;
      // deno-lint-ignore no-explicit-any
      const allShipments: any[] = [];
      // deno-lint-ignore no-explicit-any
      const allOrderItems: any[] = [];

      // ===== 1. 단일 주문(store_orders) 생성 =====
      const totalQuantity = allValidItems.reduce((sum, item) => sum + item.quantity, 0);
      const hasOnlyDigital = allValidItems.every(item => item.product.product_type === 'digital');

      const { data: order, error: orderError } = await supabase
        .from('store_orders')
        .insert({
          user_id: user.id,
          partner_id: partnerId,
          quantity: totalQuantity,
          order_type: allValidItems.length > 1 ? 'bundle' : 'single',
          subtotal_amount: totalProductAmount,
          total_shipping_fee: totalShippingFee,
          total_amount: totalAmount,
          status: hasOnlyDigital ? 'confirmed' : 'paid',
          is_confirmed: hasOnlyDigital,
          confirmed_at: hasOnlyDigital ? new Date().toISOString() : null
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // ===== 2. 모든 상품에 대해 store_order_items 생성 =====
      const orderItemsData = allValidItems.map(item => {
        // 옵션 추가 금액 계산
        const optionsPrice = (item.selected_options || [])
          .filter(opt => opt.option_type === 'select')
          .reduce((sum, opt) => sum + (opt.price_adjustment || 0), 0);
        
        const unitPrice = item.product.price + optionsPrice;
        const subtotal = unitPrice * item.quantity;

        const itemData: Record<string, unknown> = {
          order_id: order.order_id,
          product_id: item.product.product_id,
          product_name: item.product.name,
          product_price: item.product.price,
          product_type: item.product.product_type,
          product_source: item.product.source,
          quantity: item.quantity,
          unit_price: unitPrice,
          subtotal: subtotal,
          status: item.product.product_type === 'digital' ? 'confirmed' : 'pending',
          is_confirmed: item.product.product_type === 'digital',
          confirmed_at: item.product.product_type === 'digital' ? new Date().toISOString() : null
        };

        // 옵션 정보가 있으면 저장
        if (item.selected_options && item.selected_options.length > 0) {
          itemData.selected_options = item.selected_options;
        }

        return itemData;
      });

      const { data: orderItems, error: orderItemsError } = await supabase
        .from('store_order_items')
        .insert(orderItemsData)
        .select();

      if (orderItemsError) throw orderItemsError;
      allOrderItems.push(...orderItems);

      // ===== 3. 배송 그룹별 store_shipments 생성 =====
      // 배송 생성 헬퍼 함수
      const createShipment = async (items: CartItem[], shippingFee: number) => {
        if (!shippingInfo) return null;

        const { data: shipmentData, error: shipmentError } = await supabase
          .from('store_shipments')
          .insert({
            order_id: order.order_id,
            shipping_fee: shippingFee,
            recipient_name: shippingInfo.recipient_name,
            recipient_phone: shippingInfo.recipient_phone,
            recipient_address: shippingInfo.recipient_address,
            recipient_address_detail: shippingInfo.recipient_address_detail,
            recipient_postal_code: shippingInfo.recipient_postal_code,
            delivery_memo: shippingInfo.delivery_memo,
            status: 'pending'
          })
          .select()
          .single();

        if (shipmentError) throw shipmentError;

        // shipment_items 생성 - 해당 상품들의 order_item 연결
        const itemProductIds = items.map(i => i.product.product_id);
        // deno-lint-ignore no-explicit-any
        const relatedOrderItems = orderItems.filter((oi: any) => itemProductIds.includes(oi.product_id));
        
        // deno-lint-ignore no-explicit-any
        const shipmentItemsData = relatedOrderItems.map((oi: any) => ({
          shipment_id: shipmentData.shipment_id,
          order_item_id: oi.order_item_id,
          quantity: oi.quantity
        }));

        await supabase.from('store_shipment_items').insert(shipmentItemsData);

        allShipments.push(shipmentData);
        return shipmentData;
      };

      // 3-1. 파트너 묶음 가능 상품 → 하나의 배송
      if (partnerBundleItems.length > 0) {
        await createShipment(partnerBundleItems, partnerBundleShippingFee);
      }

      // 3-2. 파트너 묶음 불가 상품 → 각각 별도 배송
      for (let i = 0; i < partnerNonBundleItems.length; i++) {
        await createShipment([partnerNonBundleItems[i]], partnerNonBundleShippingFees[i]);
      }

      // 3-3. 협업 묶음 가능 상품 → 하나의 배송
      if (collabBundleItems.length > 0) {
        await createShipment(collabBundleItems, collabBundleShippingFee);
      }

      // 3-4. 협업 묶음 불가 상품 → 각각 별도 배송
      for (let i = 0; i < collabNonBundleItems.length; i++) {
        await createShipment([collabNonBundleItems[i]], collabNonBundleShippingFees[i]);
      }

      // 협업 택배 상품의 경우, 파트너가 수동으로 관리자에게 출고 요청을 보내는 구조
      // 자동 출고 요청 생성하지 않음

      // ===== 4. 재고 차감, 구매 카운트 증가, 디지털 다운로드 권한 부여 =====
      for (const item of allValidItems) {
        const product = item.product;

        // 재고 차감 (택배 상품)
        if (product.product_type === 'delivery' && product.stock !== null) {
          const newStock = product.stock - item.quantity;
          await supabase
            .from('store_products')
            .update({ stock: newStock })
            .eq('product_id', product.product_id);

          // 협업 상품 재고 동기화
          if (product.source === 'collaboration') {
            if (product.parent_product_id) {
              await supabase.from('store_products').update({ stock: newStock }).eq('product_id', product.parent_product_id);
              await supabase.from('store_products').update({ stock: newStock }).eq('parent_product_id', product.parent_product_id).neq('product_id', product.product_id);
            } else {
              await supabase.from('store_products').update({ stock: newStock }).eq('parent_product_id', product.product_id);
            }
          }
        }

        // 옵션 재고 차감 (selected_options가 있는 경우)
        const selectedOptions = item.selected_options || [];
        for (const opt of selectedOptions as Array<{ option_type: string; value_id?: string }>) {
          if (opt.option_type === 'select' && opt.value_id) {
            const { data: optValue } = await supabase
              .from('store_product_option_values')
              .select('stock')
              .eq('value_id', opt.value_id)
              .single();

            if (optValue && optValue.stock !== null) {
              const newOptionStock = optValue.stock - item.quantity;
              await supabase
                .from('store_product_option_values')
                .update({ stock: newOptionStock })
                .eq('value_id', opt.value_id);
              
              console.log(`[장바구니 checkout] 옵션 재고 차감: ${opt.value_id}, ${newOptionStock}`);
            }
          }
        }

        // 구매 카운트 증가
        await supabase
          .from('store_products')
          .update({ purchase_count: (product.purchase_count || 0) + 1 })
          .eq('product_id', product.product_id);

        // 디지털 상품 다운로드 권한 부여
        if (product.product_type === 'digital') {
          // 해당 상품의 order_item_id 찾기
          // deno-lint-ignore no-explicit-any
          const relatedOrderItem = orderItems.find((oi: any) => oi.product_id === product.product_id);
          
          const { data: assets } = await supabase
            .from('store_digital_assets')
            .select('asset_id')
            .eq('product_id', product.product_id);

          if (assets && assets.length > 0) {
            const downloadInserts = assets.map((asset: { asset_id: string }) => ({
              order_id: order.order_id,
              order_item_id: relatedOrderItem?.order_item_id || null,
              user_id: user.id,
              asset_id: asset.asset_id,
              download_count: 0
            }));

            await supabase.from('store_digital_downloads').insert(downloadInserts);
          }

          // 파트너 포인트 정산
          await processPartnerPointSettlement(supabase, order.order_id, product, item.product.price * item.quantity);
        }
      }

      // 포인트 로그 기록
      const logId = `store_cart_purchase_${user.id}_${Date.now()}`;
      await supabase.from('member_points_logs').insert({
        member_id: user.id,
        type: 'spend',
        amount: totalAmount,
        description: `스토어 장바구니 구매 (주문번호: ${order.order_id}, ${allValidItems.length}개 상품)`,
        log_id: logId
      });

      // 장바구니 비우기
      await supabase.from('store_cart_items').delete().eq('member_id', user.id);

      // 채팅방 생성 및 메시지 발송
      const { data: partnerData } = await supabase
        .from('partners')
        .select('id, member_id, partner_name')
        .eq('id', partnerId)
        .single();

      if (partnerData?.member_id) {
        const partnerMemberId = partnerData.member_id;
        let chatRoomId: string | null = null;

        const { data: existingRoom } = await supabase
          .from('chat_rooms')
          .select('id, left_by_creator, left_by_partner, created_by')
          .or(`and(created_by.eq.${user.id},partner_id.eq.${partnerMemberId}),and(created_by.eq.${partnerMemberId},partner_id.eq.${user.id})`)
          .maybeSingle();

        if (existingRoom) {
          chatRoomId = existingRoom.id;
          const isCreator = existingRoom.created_by === user.id;
          const myLeftField = isCreator ? 'left_by_creator' : 'left_by_partner';
          const myLeftValue = isCreator ? existingRoom.left_by_creator : existingRoom.left_by_partner;

          if (myLeftValue) {
            await supabase.from('chat_rooms').update({ [myLeftField]: false, is_active: true }).eq('id', chatRoomId);
          }
        } else {
          const { data: newRoom } = await supabase
            .from('chat_rooms')
            .insert({ created_by: user.id, partner_id: partnerMemberId, is_active: true })
            .select('id')
            .single();

          chatRoomId = newRoom?.id || null;
        }

        if (chatRoomId) {
          // 옵션 정보를 포함한 주문 요약 생성
          const orderSummary = allValidItems.map(item => {
            let itemText = `- ${item.product.name} x${item.quantity}개`;
            
            // 옵션 정보 추가
            if (item.selected_options && item.selected_options.length > 0) {
              const optionTexts = item.selected_options.map(opt => {
                if (opt.option_type === 'select') {
                  let text = `${opt.option_name}: ${opt.value}`;
                  if (opt.price_adjustment > 0) {
                    text += ` (+${opt.price_adjustment.toLocaleString()}P)`;
                  }
                  return text;
                } else if (opt.option_type === 'text' && opt.text_value) {
                  return `${opt.option_name}: ${opt.text_value}`;
                }
                return null;
              }).filter(Boolean);
              
              if (optionTexts.length > 0) {
                itemText += `\n  └ ${optionTexts.join(', ')}`;
              }
            }
            
            return itemText;
          }).join('\n');
          
          const digitalCount = digitalItems.length;
          const deliveryCount = allValidItems.length - digitalCount;

          let messageContent = `🛒 장바구니 상품 구매 알림\n\n` +
            `📦 주문 상품 (총 ${allValidItems.length}개)\n${orderSummary}\n\n` +
            `상품 금액: ${totalProductAmount.toLocaleString()}P\n` +
            `배송비: ${totalShippingFee.toLocaleString()}P\n` +
            `총 결제: ${totalAmount.toLocaleString()}P`;

          if (deliveryCount > 0 && shippingInfo) {
            messageContent += `\n\n📍 배송지 정보\n` +
              `받는 분: ${shippingInfo.recipient_name}\n` +
              `연락처: ${shippingInfo.recipient_phone}\n` +
              `주소: ${shippingInfo.recipient_address}${shippingInfo.recipient_address_detail ? ' ' + shippingInfo.recipient_address_detail : ''}\n` +
              (shippingInfo.delivery_memo ? `요청사항: ${shippingInfo.delivery_memo}\n` : '');
          }

          if (digitalCount > 0) {
            messageContent += `\n\n✨ 디지털 상품 ${digitalCount}개는 바로 다운로드 가능합니다.`;
          }

          // 택배 상품 개수 계산 (파트너/협업 분리)
          const partnerDeliveryCount = partnerBundleItems.length + partnerNonBundleItems.length;
          const collabDeliveryCount = collabBundleItems.length + collabNonBundleItems.length;

          if (partnerDeliveryCount > 0) {
            messageContent += `\n\n📦 개인 택배 상품 ${partnerDeliveryCount}개는 상품 준비 후 송장번호를 입력해 주세요.`;
          }
          if (collabDeliveryCount > 0) {
            messageContent += `\n\n📦 협업 택배 상품 ${collabDeliveryCount}개는 이행완료 후 출고요청을 등록해 주세요.`;
          }

          // 협업 상품만 있으면 COLLAB 태그, 개인 상품만 있으면 일반 태그, 섞여 있으면 일반 태그
          const orderTag = collabDeliveryCount > 0 && partnerDeliveryCount === 0
            ? `[STORE_ORDER_COLLAB:${order.order_id}:${partnerId}]`
            : `[STORE_ORDER:${order.order_id}:${partnerId}]`;
          messageContent += `\n\n${orderTag}`;

          // 시스템 메시지는 partnerMemberId를 sender로 설정하여 유저가 받는 메시지로 표시
          await supabase.from('member_chats').insert({
            chat_room_id: chatRoomId,
            sender_id: partnerMemberId,
            receiver_id: user.id,
            message: messageContent,
            message_type: 'system',
            is_read: false
          });

          await supabase.from('chat_rooms').update({ updated_at: new Date().toISOString() }).eq('id', chatRoomId);

          // 주문에 채팅방 연결
          await supabase.from('store_orders').update({ chat_room_id: chatRoomId }).eq('order_id', order.order_id);
        }

        // === 파트너에게 장바구니 주문 푸시 알림 발송 ===
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
        const authHeader = req.headers.get('Authorization') || `Bearer ${anonKey}`;

        const productSummary = allValidItems.length > 1 
          ? `${allValidItems[0].product.name} 외 ${allValidItems.length - 1}개`
          : allValidItems[0].product.name;

        try {
          await fetch(`${supabaseUrl}/functions/v1/push-native`, {
            method: 'POST',
            headers: {
              'Authorization': authHeader,
              'apikey': anonKey || '',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'enqueue_notification',
              user_id: partnerMemberId,
              target_member_id: partnerMemberId,
              title: '🛒 새로운 주문',
              body: `${productSummary} 주문이 들어왔습니다. (${totalAmount.toLocaleString()}P)`,
              icon: null,
              url: '/partner/store/orders',
              notification_type: 'store_cart_order',
              tag: `cart_order_${order.order_id}`,
              data: { 
                order_id: order.order_id, 
                total_items: allValidItems.length,
                total_amount: totalAmount,
                has_delivery: hasDeliveryProduct,
                has_digital: digitalItems.length > 0
              },
              process_immediately: true,
            }),
          });
        } catch (e) {
          console.error('장바구니 주문 푸시 알림 발송 실패:', e);
        }
      }

      return successResponse({
        order: { ...order, shipments: allShipments },
        order_items: allOrderItems,
        summary: {
          total_items: allValidItems.length,
          total_shipments: allShipments.length,
          total_product_amount: totalProductAmount,
          total_shipping_fee: totalShippingFee,
          total_paid: totalAmount,
          remaining_points: newPoints,
          bundle_info: {
            digital_items: digitalItems.length,
            partner_bundle_items: partnerBundleItems.length,
            partner_non_bundle_items: partnerNonBundleItems.length,
            collab_bundle_items: collabBundleItems.length,
            collab_non_bundle_items: collabNonBundleItems.length
          }
        },
        message: '주문이 완료되었습니다.'
      });
    }

    // ===== GET /api-store-cart/shipping-addresses - 배송지 목록 조회 =====
    if (pathname === '/api-store-cart/shipping-addresses' && req.method === 'GET') {
      const user = await getAuthUser(req);

      const { data, error } = await supabase
        .from('member_shipping_addresses')
        .select('*')
        .eq('member_id', user.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      return successResponse(data);
    }

    // ===== POST /api-store-cart/shipping-addresses - 배송지 추가 =====
    if (pathname === '/api-store-cart/shipping-addresses' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body) {
        return errorResponse('INVALID_REQUEST', '요청 본문이 필요합니다.');
      }

      const { name, address, address_detail, postal_code, phone, is_default = false } = body;

      if (!name || !address || !postal_code || !phone) {
        return errorResponse('INVALID_REQUEST', '이름, 기본주소, 우편번호, 전화번호는 필수입니다.');
      }

      const { data, error } = await supabase
        .from('member_shipping_addresses')
        .insert({
          member_id: user.id,
          name,
          address,
          address_detail: address_detail || null,
          postal_code,
          phone,
          is_default
        })
        .select()
        .single();

      if (error) throw error;

      return successResponse(data);
    }

    // ===== PUT /api-store-cart/shipping-addresses/:id - 배송지 수정 =====
    const addressUpdateMatch = pathname.match(/^\/api-store-cart\/shipping-addresses\/([a-f0-9-]+)$/);
    if (addressUpdateMatch && req.method === 'PUT') {
      const user = await getAuthUser(req);
      const addressId = addressUpdateMatch[1];
      const body = await parseRequestBody(req);

      if (!body) {
        return errorResponse('INVALID_REQUEST', '요청 본문이 필요합니다.');
      }

      const { name, address, address_detail, postal_code, phone, is_default } = body;

      const updateData: Record<string, any> = {};
      if (name !== undefined) updateData.name = name;
      if (address !== undefined) updateData.address = address;
      if (address_detail !== undefined) updateData.address_detail = address_detail;
      if (postal_code !== undefined) updateData.postal_code = postal_code;
      if (phone !== undefined) updateData.phone = phone;
      if (is_default !== undefined) updateData.is_default = is_default;

      const { data, error } = await supabase
        .from('member_shipping_addresses')
        .update(updateData)
        .eq('id', addressId)
        .eq('member_id', user.id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return errorResponse('NOT_FOUND', '배송지를 찾을 수 없습니다.', null, 404);
        }
        throw error;
      }

      return successResponse(data);
    }

    // ===== DELETE /api-store-cart/shipping-addresses/:id - 배송지 삭제 =====
    const addressDeleteMatch = pathname.match(/^\/api-store-cart\/shipping-addresses\/([a-f0-9-]+)$/);
    if (addressDeleteMatch && req.method === 'DELETE') {
      const user = await getAuthUser(req);
      const addressId = addressDeleteMatch[1];

      const { error } = await supabase
        .from('member_shipping_addresses')
        .delete()
        .eq('id', addressId)
        .eq('member_id', user.id);

      if (error) throw error;

      return successResponse({ message: '배송지가 삭제되었습니다.' });
    }

    return errorResponse('NOT_FOUND', '요청한 엔드포인트를 찾을 수 없습니다.', null, 404);

  } catch (error) {
    console.error('Store Cart API Error:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : '서버 오류가 발생했습니다.',
      null,
      500
    );
  }
});

// 파트너 포인트 정산 처리 함수
// 협업상품: 같은 원본 상품의 모든 협업 파트너에게 share_rate만큼 배분
// 파트너 개인상품: store_points에 전체 금액 적립
async function processPartnerPointSettlement(
  supabase: ReturnType<typeof createSupabaseClient>,
  orderId: string,
  product: CartProduct,
  totalAmount: number
) {
  const partnerId = product.partner_id;
  const productSource = product.source;

  if (!partnerId) return;

  // 협업 상품인 경우: 같은 원본 상품의 모든 협업 파트너에게 배분
  if (productSource === 'collaboration') {
    // 원본 상품 ID 찾기 (parent_product_id가 있으면 그것, 없으면 현재 product_id)
    const originalProductId = product.parent_product_id || product.product_id;
    
    // 해당 원본 상품의 모든 협업 요청 조회
    const { data: allCollaborationRequests } = await supabase
      .from('store_collaboration_requests')
      .select('request_id, partner_id, share_rate, status')
      .eq('product_id', originalProductId)
      .eq('status', 'accepted');
    
    if (allCollaborationRequests && allCollaborationRequests.length > 0) {
      console.log(`협업상품 포인트 배분: 원본상품=${originalProductId}, 파트너수=${allCollaborationRequests.length}, 총금액=${totalAmount}`);
      
      // 각 협업 파트너에게 share_rate만큼 배분
      for (const collabRequest of allCollaborationRequests) {
        const targetPartnerId = collabRequest.partner_id;
        const shareRate = collabRequest.share_rate ?? 100;
        const partnerAmount = Math.floor(totalAmount * (shareRate / 100));
        
        if (partnerAmount <= 0) continue;
        
        const { data: partner } = await supabase
          .from('partners')
          .select('id, collaboration_store_points')
          .eq('id', targetPartnerId)
          .single();
        
        if (partner) {
          const logId = `store_sale_${orderId}_${targetPartnerId}_${product.product_id}`;
          
          // 중복 적립 방지
          const { data: existingLog } = await supabase
            .from('partner_points_logs')
            .select('id')
            .eq('log_id', logId)
            .maybeSingle();
          
          if (existingLog) {
            console.log(`이미 적립됨: ${logId}`);
            continue;
          }
          
          const newCollabPoints = (partner.collaboration_store_points || 0) + partnerAmount;
          await supabase
            .from('partners')
            .update({ collaboration_store_points: newCollabPoints })
            .eq('id', targetPartnerId);
          
          await supabase.from('partner_points_logs').insert({
            partner_id: targetPartnerId,
            type: 'earn',
            amount: partnerAmount,
            description: `협업 상품 판매 (배분 ${shareRate}%): ${product.name}`,
            log_id: logId,
            point_type: 'collaboration_store_points'
          });
          
          console.log(`협업 포인트 적립: 파트너=${targetPartnerId}, share_rate=${shareRate}%, 적립금=${partnerAmount}`);
        }
      }
    } else {
      // 협업 요청이 없는 경우 주문의 파트너에게만 적립 (fallback)
      const { data: partner } = await supabase
        .from('partners')
        .select('id, collaboration_store_points')
        .eq('id', partnerId)
        .single();
      
      if (partner) {
        const logId = `store_sale_${orderId}_${partnerId}_${product.product_id}`;
        const newCollabPoints = (partner.collaboration_store_points || 0) + totalAmount;
        await supabase
          .from('partners')
          .update({ collaboration_store_points: newCollabPoints })
          .eq('id', partnerId);
        
        await supabase.from('partner_points_logs').insert({
          partner_id: partnerId,
          type: 'earn',
          amount: totalAmount,
          description: `협업 상품 판매: ${product.name}`,
          log_id: logId,
          point_type: 'collaboration_store_points'
        });
      }
    }
    return;
  }

  // 개인 상품: 주문의 파트너에게 전액 적립
  const { data: partner, error: partnerError } = await supabase
    .from('partners')
    .select('id, store_points')
    .eq('id', partnerId)
    .single();

  if (partnerError || !partner) return;

  const logId = `store_sale_${orderId}_${partnerId}_${product.product_id}`;
  const newStorePoints = (partner.store_points || 0) + totalAmount;
  await supabase.from('partners').update({ store_points: newStorePoints }).eq('id', partnerId);

  await supabase.from('partner_points_logs').insert({
    partner_id: partnerId,
    type: 'earn',
    amount: totalAmount,
    description: `스토어 상품 판매: ${product.name}`,
    log_id: logId,
    point_type: 'store_points'
  });
}
