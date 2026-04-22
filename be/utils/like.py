def format_likes(raw: str) -> dict:
    """
    Parse dan format likes string ke int + display string.
    Returns: { "raw": "2.3万", "value": 23000, "display": "23.0K" }
    """
    if not raw:
        return {"raw": raw, "value": 0, "display": "0"}

    s = str(raw).strip().replace(',', '')
    try:
        if '万' in s:
            value = int(float(s.replace('万', '')) * 10000)
        elif 'k' in s.lower():
            value = int(float(s.lower().replace('k', '')) * 1000)
        else:
            value = int(float(s))
    except:
        return {"raw": raw, "value": 0, "display": raw}

    # Format display
    if value >= 10000:
        display = f"{value / 10000:.1f}万"
    elif value >= 1000:
        display = f"{value / 1000:.1f}K"
    else:
        display = str(value)

    return {"raw": raw, "value": value, "display": display}