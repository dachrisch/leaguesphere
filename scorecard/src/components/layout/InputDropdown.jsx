import React, {useState, useEffect} from 'react';
import PropTypes from 'prop-types';
import {FaCheck, FaQuestion, FaSearch, FaTrashAlt} from 'react-icons/fa';
import FloatingInput from './FloatingInput';

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const StatusBadge = ({found}) => (
  <span
    data-testid={found ? 'officialFound' : 'officialNotFound'}
    className={`d-inline-flex align-items-center justify-content-center
      rounded ${found ? 'bg-success text-white' : 'bg-warning text-dark'}`}
    style={{width: '1.5rem', height: '1.5rem'}}>
    {found ? <FaCheck /> : <FaQuestion />}
  </span>
);

StatusBadge.propTypes = {found: PropTypes.bool.isRequired};

const InputDropdown = (props) => {
  const {
    setSelectedIndex,
    searchForText = () => {},
    placeholderText,
    id,
    itemLimit = 5,
    focus = false,
    items,
    onSelected = () => {},
    initValues = {}} = props;

  const [searchInput, setSearchInput] = useState('');
  const [displaySuggestionBox, setDisplaySuggestionBox] = useState(false);
  const [displaySearchInput, setDisplaySearchInput] = useState(true);
  const [autofocus, setAutofocus] = useState(focus);
  const [displaySearchButton, setDisplaySearchButton] = useState(true);
  const [officialFound, setOfficialFound] = useState(false);
  const [selectedLicense, setSelectedLicense] = useState(null);
  useEffect(() => {
    if (initValues && Object.keys(initValues).length !== 0) {
      if (initValues.text && !initValues.id) {
        setSearchInput(initValues.text);
        setSelectedIndex({text: initValues.text, id: null});
        setOfficialFound(false);
      }
      if (initValues.text && initValues.id) {
        setSearchInput(initValues.text);
        setSelectedIndex({text: initValues.text, id: initValues.id});
        setDisplaySuggestionBox(false);
        setDisplaySearchInput(false);
        setOfficialFound(true);
      }
    }
  }, [initValues]);
  useEffect(() => {
    setDisplaySearchButton(true);
  }, [items]);

  const handleSearchSelection = (itemText, id, license = null) => {
    setSelectedLicense(license);
    setSearchInput(itemText);
    setSelectedIndex(license ?
      {text: itemText, id: id, licenseValid: license.valid} :
      {text: itemText, id: id});
    setOfficialFound(true);
    setDisplaySuggestionBox(false);
    setDisplaySearchInput(false);
    onSelected();
  };
  const submitSearch = (event) => {
    event.preventDefault();
    setDisplaySearchInput(true);
    setDisplaySuggestionBox(true);
    setAutofocus(true);
    searchForText(searchInput);
    setDisplaySearchButton(false);
  };
  const blockSearch = (event) => {
    event.preventDefault();
    setDisplaySearchInput(true);
    setDisplaySuggestionBox(true);
    setAutofocus(true);
    setDisplaySearchButton(false);
  };
  const clearSearchInput = () => {
    setDisplaySearchInput(true);
    setDisplaySuggestionBox(true);
    setSelectedIndex({text: '', id: null});
    setOfficialFound(false);
    setSelectedLicense(null);
    setSearchInput('');
    setAutofocus(true);
  };
  const onChange = (value) => {
    setSearchInput(value);
    setSelectedIndex({text: value, id: null});
    setOfficialFound(false);
    setSelectedLicense(null);
  };
  const checkName = (item, input) => {
    const pattern = input
        .trim()
        .replace(/\s+/g, ' ')
        .split('')
        .map((character) => `${escapeRegExp(character)}.*`)
        .join('');
    const regex = new RegExp(pattern, 'gi');
    return item.match(regex);
  };
  const filteredItems = items.filter((item) => {
    return checkName(item.text, searchInput);
  });
  let itemsToDisplay = searchInput ? filteredItems : items;
  itemsToDisplay = itemsToDisplay.slice(0, itemLimit);
  return (
    <div>
      <div className='mt-2' style={{position: 'relative'}}>
        {!displaySearchInput && (
          <div className='row mt-2'>
            <div className='col'>
              <FloatingInput
                id={id}
                text={placeholderText}
                value={searchInput || ''}
                required={false}
                readOnly={true}
                startAdornment={<StatusBadge found={officialFound} />}
                onChange={()=>{}} />
              {selectedLicense && (
                <div
                  data-testid='officialLicense'
                  className={`small ps-1 ${selectedLicense.expired ?
                    'text-danger' : 'text-muted'}`}>
                  {selectedLicense.label}
                </div>
              )}
            </div>
            <div className='col-3 d-grid'>
              <button
                type='reset'
                className='btn btn-danger mt-3'
                onClick={clearSearchInput}
              >
                <FaTrashAlt />
              </button>
            </div>
          </div>
        )}
        {displaySearchInput &&
        <div className='row'>
          <div className='col'>
            <FloatingInput
              autofocus={autofocus}
              setHasFocus={setDisplaySuggestionBox}
              id={id}
              show={displaySearchInput}
              onChange={onChange}
              text={placeholderText}
              required={false}
              startAdornment={<StatusBadge found={officialFound} />}
              value={searchInput} />
            <ul
              className='list-group'
              style={{
                position: 'absolute',
                zIndex: 99,
                width: '100%',
                display: displaySuggestionBox ? 'block' : 'none',
              }}
            >
              {itemsToDisplay.map((item, index) => (
                <li
                  key={index}
                  className='list-group-item bg-light'
                  onMouseDown={() => {
                    handleSearchSelection(item.text, item.id, item.licenseLabel ?
                      {label: item.licenseLabel, expired: item.licenseExpired,
                        valid: item.licenseValid} :
                      null);
                  }}
                >
                  <div className='row'>
                    <div className='col-9'>
                      {item.text}
                      {item.licenseLabel && (
                        <div
                          className={`small ${item.licenseExpired ?
                            'text-danger' : 'text-muted'}`}>
                          {item.licenseLabel}
                        </div>
                      )}
                    </div>
                    <div
                      className='col-3 text-end text-muted ps-0 pe-0'
                      style={{fontSize: 'x-small'}}
                    >
                      {item.subtext}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          { displaySearchButton &&
          <div className='col-3 d-grid mt-3'>
            <button type="button"
              onMouseDown={submitSearch}
              className="btn btn-secondary"
              data-testid="searchButton">
              <FaSearch />
            </button>
          </div>}
          { !displaySearchButton &&
          <div className='col-3 d-grid mt-3'>
            <button type="button"
              onMouseDown={blockSearch}
              className="btn btn-secondary disabled"
              data-testid="searchButtonDisabled"
              style={{pointerEvents: 'all'}}>
              <FaSearch />
            </button>
          </div>}
        </div>
        }
      </div>
    </div>
  );
};

InputDropdown.propTypes = {
  id: PropTypes.string.isRequired,
  setSelectedIndex: PropTypes.func.isRequired,
  placeholderText: PropTypes.string.isRequired,
  items: PropTypes.array.isRequired,
  searchForText: PropTypes.func,
  onSelected: PropTypes.func,
  itemLimit: PropTypes.number,
  initValues: PropTypes.object,
  focus: PropTypes.bool,
};

export default InputDropdown;
